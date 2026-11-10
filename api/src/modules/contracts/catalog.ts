import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Transaction } from "../../db/client.js";
import {
  contractTemplates as templates,
  templateVariables as variables,
  contracts,
} from "../../db/schema.js";
import { requireRole } from "../../plugins/auth.js";
import { ApiError } from "../../lib/errors.js";
import { extractVariables, renderTemplate } from "../../lib/render-template.js";
import { parse, uuid, templateInput, variableInput, values } from "./schemas.js";
const missing = () => new ApiError(404, "NOT_FOUND", "No se encontró el recurso.");
export async function resolveVariables(tx: Transaction | typeof db, content: string) {
  const names = extractVariables(content);
  const defs = names.length
    ? await tx.select().from(variables).where(inArray(variables.name, names))
    : [];
  const unknown = names.filter(
    (versionNumber) => !defs.some((variable) => variable.name === versionNumber),
  );
  if (unknown.length)
    throw new ApiError(400, "VALIDATION_ERROR", "Variables desconocidas.", { unknown });
  return { names, defs };
}
export async function catalogRoutes(app: FastifyInstance) {
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
    const [row] = await db.insert(variables).values(data).returning();
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
      return (await tx.update(variables).set(data).where(eq(variables.id, id)).returning())[0];
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
      await tx.delete(variables).where(eq(variables.id, id));
      return { message: "Variable eliminada." };
    }),
  );
  app.get("/templates", read, async (req) => {
    const query = parse(
      z.object({
        status: z.enum(["active", "inactive"]).optional(),
        q: z.string().optional(),
        category: z.string().optional(),
      }),
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
          query.q ? sql`${templates.title} ilike ${"%" + query.q + "%"}` : undefined,
        ),
      );
    const counts = await db
      .select({ id: contracts.templateId, n: sql<number>`count(*)::int` })
      .from(contracts)
      .groupBy(contracts.templateId);
    return rows.map((template) => ({
      ...template,
      usageCount: counts.find((usageCount) => usageCount.id === template.id)?.n ?? 0,
    }));
  });
  app.post("/templates/preview", read, async (req) => {
    const input = parse(z.object({ content: z.string().max(200000), values }).strict(), req.body);
    const { defs } = await resolveVariables(db, input.content);
    if (req.user.role === "gestor") {
      const active = await txActiveNames();
      if (defs.some((variable) => !active.has(variable.name)))
        throw new ApiError(403, "FORBIDDEN", "Variable no disponible.");
    }
    return renderTemplate(input.content, input.values, defs);
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
    return { ...template, resolvedVariables: (await resolveVariables(db, template.content)).defs };
  });
  app.post("/templates", write, async (req, reply) => {
    const data = parse(templateInput, req.body);
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10404)`);
      const { names } = await resolveVariables(tx, data.content);
      return (
        await tx
          .insert(templates)
          .values({ ...data, variables: names, createdBy: req.user.id })
          .returning()
      )[0];
    });
    return reply.code(201).send(result);
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
          return { message: "Plantilla eliminada." };
        }
        if (kind === "duplicate")
          return (
            await tx
              .insert(templates)
              .values({
                title: old.title + " (copia)",
                content: old.content,
                description: old.description,
                category: old.category,
                variables: old.variables,
                status: "inactive",
                createdBy: req.user.id,
              })
              .returning()
          )[0];
        const patch =
          kind === "status"
            ? parse(z.object({ status: z.enum(["active", "inactive"]) }).strict(), req.body)
            : parse(
                templateInput.partial().extend({
                  category: z.string().trim().min(1).max(1000).optional(),
                  status: z.enum(["active", "inactive"]).optional(),
                }),
                req.body,
              );
        const { names } = await resolveVariables(
          tx,
          ("content" in patch ? patch.content : undefined) ?? old.content,
        );
        return (
          await tx
            .update(templates)
            .set({ ...patch, variables: names })
            .where(eq(templates.id, id))
            .returning()
        )[0];
      });
    if (kind === "delete") app.delete("/templates/:id", write, handler);
    else if (kind === "duplicate") app.post("/templates/:id/duplicate", write, handler);
    else app.patch(kind === "status" ? "/templates/:id/status" : "/templates/:id", write, handler);
  }
}
