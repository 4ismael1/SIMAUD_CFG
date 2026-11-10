import { escapeLike } from "../../lib/sql.js";
import { storedDocument } from "../../lib/rich-doc/content.js";
import { templatePreviewRoutes } from "./template-preview.js";
import { auditCatalog } from "../audit/catalog.js";
import { assertVariableNotReferenced } from "./variable-usage.js";
import { normalizeTemplateValues } from "../../lib/validation/template-values.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  contractTemplates as templates,
  templateVariables as variables,
  contracts,
} from "../../db/schema.js";
import { requireRole } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import {
  contentResponse,
  encodeContent,
  renderContent,
  previewContentInput,
  contentFormatSchema,
} from "../../lib/rich-doc/content.js";
import { resolveVariables } from "./catalog-variables.js";
export { resolveVariables } from "./catalog-variables.js";
import { parse, uuid, templateInput, variableInput, values } from "./schemas.js";
const missing = () => new ApiError(404, "NOT_FOUND", "No se encontró el recurso.");
export async function catalogRoutes(app: FastifyInstance) {
  await templatePreviewRoutes(app);
  const read = { preHandler: requireRole("admin", "supervisor", "gestor") };
  const write = { preHandler: requireRole("admin", "supervisor") };
  app.get("/variables", read, async (req) => {
    if (req.user.role !== "gestor") return db.select().from(variables);
    const active = await db.select().from(templates).where(eq(templates.status, "active"));
    const names = [...new Set(active.flatMap((template) => template.variables))];
    return names.length ? db.select().from(variables).where(inArray(variables.name, names)) : [];
  });
  app.post("/variables", write, async (req, reply) => {
    const data = parse(variableInput, req.body);
    if (data.type === "select" && !data.options?.length)
      throw new ApiError(400, "VALIDATION_ERROR", "Select exige opciones.");
    const row = await db.transaction(async (tx) => {
      const [created] = await tx.insert(variables).values(data).returning();
      await auditCatalog(tx, req, "variables", "variable.created", created!);
      return created;
    });
    return reply.code(201).send(row);
  });
  app.patch("/variables/:id", write, async (req) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
      const id = parse(uuid, (req.params as { id: string }).id);
      const [old] = await tx.select().from(variables).where(eq(variables.id, id)).for("update");
      if (!old) throw missing();
      const patch = parse(
        variableInput.partial().extend({ required: z.boolean().optional() }),
        req.body,
      );
      const data = {
        name: old.name,
        label: old.label,
        type: old.type,
        required: old.required,
        options: old.options,
        description: old.description,
        ...patch,
      };
      if (data.type === "select" && !data.options?.length)
        throw new ApiError(400, "VALIDATION_ERROR", "Select exige opciones.");
      if (data.name !== old.name) {
        const used = await tx
          .select({ id: templates.id, title: templates.title })
          .from(templates)
          .where(sql`${old.name}=ANY(${templates.variables})`);
        if (used.length)
          throw new ApiError(409, "CONFLICT", "Variable en uso.", { templates: used });
      }
      const [updated] = await tx
        .update(variables)
        .set(data)
        .where(eq(variables.id, id))
        .returning();
      await auditCatalog(tx, req, "variables", "variable.updated", updated!, Object.keys(patch));
      return updated;
    }),
  );
  app.delete("/variables/:id", write, async (req) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
      const id = parse(uuid, (req.params as { id: string }).id);
      const [variable] = await tx.select().from(variables).where(eq(variables.id, id));
      if (!variable) throw missing();
      const used = await tx
        .select({ id: templates.id, title: templates.title })
        .from(templates)
        .where(sql`${variable.name}=ANY(${templates.variables})`);
      if (used.length) throw new ApiError(409, "CONFLICT", "Variable en uso.", { templates: used });
      await assertVariableNotReferenced(tx, variable.name);
      await tx.delete(variables).where(eq(variables.id, id));
      await auditCatalog(tx, req, "variables", "variable.deleted", variable);
      return { message: "Variable eliminada." };
    }),
  );
  app.get("/templates", read, async (req) => {
    const query = parse(
      z
        .object({
          status: z.enum(["active", "inactive"]).optional(),
          q: z.string().max(200).optional(),
          category: z.string().max(1000).optional(),
        })
        .strict(),
      req.query,
    );
    const rows = await db
      .select()
      .from(templates)
      .where(
        and(
          req.user.role === "gestor"
            ? eq(templates.status, "active")
            : query.status
              ? eq(templates.status, query.status)
              : undefined,
          query.category ? eq(templates.category, query.category) : undefined,
          query.q ? sql`${templates.title} ilike ${"%" + escapeLike(query.q) + "%"}` : undefined,
        ),
      );
    const counts = await db
      .select({ id: contracts.templateId, n: sql<number>`count(*)::int` })
      .from(contracts)
      .groupBy(contracts.templateId);
    return rows.map((template) => ({
      ...contentResponse(template),
      usageCount: counts.find((usageCount) => usageCount.id === template.id)?.n ?? 0,
    }));
  });
  app.post("/templates/preview", read, async (req) => {
    const input = parse(
      z
        .object({
          content: previewContentInput,
          contentFormat: contentFormatSchema.default("plain"),
          values,
        })
        .strict(),
      req.body,
    );
    const content =
      input.contentFormat === "plain" && input.content === ""
        ? ""
        : encodeContent(input.content, input.contentFormat);
    const { defs } = await resolveVariables(db, content, input.contentFormat);
    if (req.user.role === "gestor") {
      const active = await txActiveNames();
      if (defs.some((variable) => !active.has(variable.name)))
        throw new ApiError(403, "FORBIDDEN", "Variable no disponible.");
    }
    return renderContent(
      content,
      input.contentFormat,
      normalizeTemplateValues(input.values, defs),
      defs,
    );
  });
  async function txActiveNames() {
    return new Set(
      (await db.select().from(templates).where(eq(templates.status, "active"))).flatMap(
        (template) => template.variables,
      ),
    );
  }
  app.get("/templates/:id", read, async (req) => {
    const [template] = await db
      .select()
      .from(templates)
      .where(eq(templates.id, parse(uuid, (req.params as { id: string }).id)));
    if (!template || (req.user.role === "gestor" && template.status !== "active")) throw missing();
    return {
      ...contentResponse(template),
      hasSignatureBlock:
        template.contentFormat !== "plain" &&
        storedDocument(template.content).content.some((node) => node.type === "signatures"),
      resolvedVariables: (await resolveVariables(db, template.content, template.contentFormat))
        .defs,
    };
  });
  app.post("/templates", write, async (req, reply) => {
    const data = parse(templateInput, req.body);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
      const content = encodeContent(data.content, data.contentFormat);
      const { names } = await resolveVariables(tx, content, data.contentFormat);
      const [created] = await tx
        .insert(templates)
        .values({ ...data, content, variables: names, createdBy: req.user.id })
        .returning();
      await auditCatalog(tx, req, "templates", "template.created", created!);
      return created;
    });
    return reply.code(201).send(contentResponse(result!));
  });
  for (const kind of ["edit", "status", "duplicate", "delete"] as const) {
    const handler = async (req: FastifyRequest) =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
        const id = parse(uuid, (req.params as { id: string }).id);
        const [old] = await tx.select().from(templates).where(eq(templates.id, id)).for("update");
        if (!old) throw missing();
        if (kind === "delete") {
          const used = await tx
            .select({ id: contracts.id })
            .from(contracts)
            .where(eq(contracts.templateId, id))
            .limit(1);
          if (used.length) throw new ApiError(409, "CONFLICT", "La plantilla tiene contratos.");
          await tx.delete(templates).where(eq(templates.id, id));
          await auditCatalog(tx, req, "templates", "template.deleted", old);
          return { message: "Plantilla eliminada." };
        }
        if (kind === "duplicate") {
          const [duplicate] = await tx
            .insert(templates)
            .values({
              title: old.title + " (copia)",
              content: old.content,
              contentFormat: old.contentFormat,
              description: old.description,
              category: old.category,
              variables: old.variables,
              status: "inactive",
              createdBy: req.user.id,
            })
            .returning();
          await auditCatalog(tx, req, "templates", "template.duplicated", duplicate!);
          return contentResponse(duplicate!);
        }
        const patch =
          kind === "status"
            ? parse(z.object({ status: z.enum(["active", "inactive"]) }).strict(), req.body)
            : parse(
                templateInput.partial().extend({
                  contentFormat: contentFormatSchema.optional(),
                  category: z.string().trim().min(1).max(1000).optional(),
                  status: z.enum(["active", "inactive"]).optional(),
                }),
                req.body,
              );
        const format =
          "contentFormat" in patch ? (patch.contentFormat ?? old.contentFormat) : old.contentFormat;
        if (old.contentFormat !== "plain" && format === "plain")
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "Una plantilla con formato no se puede convertir a texto plano.",
          );
        const content =
          "content" in patch && patch.content !== undefined
            ? encodeContent(patch.content, format)
            : old.content;
        if (format !== old.contentFormat && !("content" in patch))
          throw new ApiError(400, "VALIDATION_ERROR", "Envía el documento al cambiar de formato.");
        const { names } = await resolveVariables(tx, content, format);
        const [updated] = await tx
          .update(templates)
          .set({ ...patch, content, contentFormat: format, variables: names })
          .where(eq(templates.id, id))
          .returning();
        await auditCatalog(
          tx,
          req,
          "templates",
          kind === "status" ? "template.status_changed" : "template.updated",
          updated!,
          Object.keys(patch),
        );
        return contentResponse(updated!);
      });
    if (kind === "delete") app.delete("/templates/:id", write, handler);
    else if (kind === "duplicate") app.post("/templates/:id/duplicate", write, handler);
    else app.patch(kind === "status" ? "/templates/:id/status" : "/templates/:id", write, handler);
  }
}
