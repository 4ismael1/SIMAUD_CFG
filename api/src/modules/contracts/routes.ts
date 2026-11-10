import { historicalDefinitions, lockVariableCatalog } from "./variable-history.js";
import { validateInstitutionLogo } from "../../lib/storage-image-validation.js";
import { applyContractAction } from "./actions.js";
import { adminContractRoutes } from "./admin-routes.js";
import { canReassign } from "./admin-actions.js";
import { statusList } from "../reports/overview-schema.js";
import { activateRenewalParent } from "../renewals/routes.js";
import { removeFinalPdf } from "./pdf.js";
import { withStorageMutation } from "../../lib/storage.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  contracts,
  contractSignatories as signatories,
  contractApprovals as approvals,
  contractVersions as versions,
  contractAuditLogs as logs,
  users,
  contractTemplates,
  contractStatus,
  files,
} from "../../db/schema.js";
import { authenticate, requireRole } from "../../plugins/auth.js";
import {
  parse,
  uuid,
  contractInput,
  contractRelations,
  values,
  contractFields,
  pageInput,
  actionInput,
} from "./schemas.js";
import { transition } from "./state-machine.js";
import * as contractService from "./service.js";
import { signatureRoutes, removeSignatureFiles } from "./signatures.js";
export async function contractRoutes(app: FastifyInstance) {
  app.addHook("preValidation", validateInstitutionLogo);
  const auth = { preHandler: authenticate };
  const staff = { preHandler: requireRole("admin", "supervisor", "gestor") };
  const idOf = (req: FastifyRequest) => parse(uuid, (req.params as { id: string }).id);
  async function detail(req: FastifyRequest, id: string) {
    return db.transaction(async (tx) => {
      await contractService.linkSignatories(tx, req.user);
      const contract = await contractService.getContract(tx, id);
      const allSignatories = await contractService.getSignatories(tx, id);
      if (!contractService.canRead(contract, req.user, allSignatories))
        throw contractService.notFound();
      const signatureFiles = await tx
        .select({ id: files.id, path: files.path })
        .from(files)
        .where(and(eq(files.contractId, id), eq(files.kind, "signature")));
      return {
        ...(await contractService.decorate(tx, contract)),
        signatories: allSignatories.map((item) => ({
          ...item,
          signatureFileId: signatureFiles.find((f) => f.path === item.signaturePath)?.id ?? null,
        })),
        can: {
          ...contractService.permissions(contract, req.user, allSignatories),
          reassign: canReassign(contract, req.user),
        },
      };
    });
  }
  const listSchema = pageInput.extend({
    status: statusList.optional(),
    q: z.string().optional(),
    templateId: uuid.optional(),
    createdBy: uuid.optional(),
    expiresBefore: z.iso.date().optional(),
    createdFrom: z.iso.date().optional(),
    createdTo: z.iso.date().optional(),
    archived: z.enum(["true", "false"]).default("false"),
    sort: z
      .enum([
        "updatedAt",
        "-updatedAt",
        "createdAt",
        "-createdAt",
        "title",
        "-title",
        "endDate",
        "-endDate",
        "code",
        "-code",
      ])
      .default("-updatedAt"),
  });
  app.get("/contracts", staff, async (req) => {
    const query = parse(listSchema, req.query);
    if (query.createdFrom && query.createdTo && query.createdFrom > query.createdTo)
      throw contractService.invalid("Rango de fechas inválido.");
    const search = query.q ? "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%" : undefined;
    const where = and(
      req.user.role === "gestor" ? eq(contracts.createdBy, req.user.id) : undefined,
      query.status ? inArray(contracts.status, query.status) : undefined,
      query.templateId ? eq(contracts.templateId, query.templateId) : undefined,
      query.createdBy ? eq(contracts.createdBy, query.createdBy) : undefined,
      eq(contracts.archived, query.archived === "true"),
      query.expiresBefore ? sql`${contracts.endDate}<${query.expiresBefore}` : undefined,
      query.createdFrom
        ? sql`${contracts.createdAt} >= ${query.createdFrom}::date::timestamp at time zone 'America/Santo_Domingo'`
        : undefined,
      query.createdTo
        ? sql`${contracts.createdAt} < (${query.createdTo}::date + 1)::timestamp at time zone 'America/Santo_Domingo'`
        : undefined,
      search
        ? sql`(${contracts.title} ilike ${search} OR ${contracts.code} ilike ${search}
          OR ${contracts.clientName} ilike ${search}
          OR exists (select 1 from users manager where manager.id = ${contracts.createdBy} and manager.name ilike ${search})
          OR exists (select 1 from contract_signatories signer where signer.contract_id = ${contracts.id}
            and (signer.name ilike ${search} or signer.cedula ilike ${search})))`
        : undefined,
    );
    const column = {
      updatedAt: contracts.updatedAt,
      createdAt: contracts.createdAt,
      title: contracts.title,
      endDate: contracts.endDate,
      code: contracts.code,
    }[query.sort.replace("-", "")]!;
    const rows = await db
      .select()
      .from(contracts)
      .where(where)
      .orderBy(sql`${column} ${sql.raw(query.sort.startsWith("-") ? "desc" : "asc")}`, contracts.id)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const [count] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(where);
    return {
      data: await Promise.all(rows.map((contract) => contractService.decorate(db, contract))),
      meta: { page: query.page, pageSize: query.pageSize, total: count!.n },
    };
  });
  app.get("/contracts/counts", staff, async (req) => {
    const query = parse(
      z.object({ archived: z.enum(["true", "false"]).default("false") }),
      req.query,
    );
    const rows = await db
      .select({ status: contracts.status, n: sql<number>`count(*)::int` })
      .from(contracts)
      .where(
        and(
          req.user.role === "gestor" ? eq(contracts.createdBy, req.user.id) : undefined,
          eq(contracts.archived, query.archived === "true"),
        ),
      )
      .groupBy(contracts.status);
    return Object.fromEntries(
      contractStatus.enumValues.map((status) => [
        status,
        rows.find((r) => r.status === status)?.n ?? 0,
      ]),
    );
  });
  app.post("/contracts", { preHandler: requireRole("admin", "gestor") }, async (req, reply) => {
    const input = parse(contractInput, req.body);
    const contract = await db.transaction(async (tx) => {
      await lockVariableCatalog(tx);
      const [template] = await tx
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.id, input.templateId))
        .for("share");
      if (!template || (req.user.role === "gestor" && template.status !== "active"))
        throw contractService.invalid("Plantilla no disponible.");
      const generatedContent = await contractService.prepareContent(
        tx,
        template.content,
        input.variables,
      );
      const [contract] = await tx
        .insert(contracts)
        .values({
          templateId: template.id,
          title: input.title,
          content: template.content,
          generatedContent,
          variablesData: input.variables,
          contractValue: String(input.value),
          startDate: input.startDate,
          endDate: input.endDate,
          notes: input.notes,
          createdBy: req.user.id,
        })
        .returning();
      await contractService.reconcileSignatories(tx, contract!.id, input.signatories);
      await contractService.snapshot(tx, contract!, req.user, "Creación");
      await contractService.record(tx, req, contract!, "create", null, contract);
      return contract!;
    });
    return reply.code(201).send(await detail(req, contract.id));
  });
  app.get("/contracts/:id", auth, (req) => detail(req, idOf(req)));
  app.patch("/contracts/:id", { preHandler: requireRole("admin", "gestor") }, async (req) => {
    const id = idOf(req);
    await db.transaction(async (tx) => {
      await lockVariableCatalog(tx);
      const contract = await contractService.getContract(tx, id, true);
      const previousSignatories = await contractService.getSignatories(tx, id);
      if (!(
        req.user.role === "admin" ||
        (req.user.role === "gestor" && contract.createdBy === req.user.id)
      ))
        throw contractService.forbidden();
      if (!contractService.permissions(contract, req.user, previousSignatories).edit)
        throw contractService.conflict();
      const patch = parse(
        contractFields
          .partial()
          .extend({ content: z.string().min(1).max(200000).optional() })
          .strict(),
        req.body,
      );
      if (!Object.keys(patch).length) throw contractService.invalid("Debe indicar algún cambio.");
      const merged = {
        templateId: patch.templateId ?? contract.templateId,
        title: patch.title ?? contract.title,
        variables: patch.variables ?? parse(values, contract.variablesData),
        value: patch.value ?? contract.contractValue ?? "0",
        startDate: patch.startDate ?? contract.startDate,
        endDate: patch.endDate ?? contract.endDate,
        notes: patch.notes === undefined ? contract.notes : patch.notes,
        signatories:
          patch.signatories ??
          previousSignatories.map((item) => ({
            name: item.name,
            email: item.email,
            phone: item.phone ?? undefined,
            cedula: item.cedula ?? undefined,
            role: item.role,
            signingOrder: item.signingOrder,
          })),
      };
      parse(contractRelations, merged);
      let content = patch.content ?? contract.content;
      if (patch.templateId && patch.templateId !== contract.templateId) {
        const [template] = await tx
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, patch.templateId))
          .for("share");
        if (!template || (req.user.role === "gestor" && template.status !== "active"))
          throw contractService.invalid("Plantilla no disponible.");
        content = patch.content ?? template.content;
      }
      const generatedContent = await contractService.prepareContent(
        tx,
        content,
        merged.variables,
        patch.variables !== undefined,
      );
      const changes = {
        templateId: merged.templateId,
        title: merged.title,
        variablesData: merged.variables,
        contractValue: String(merged.value),
        startDate: merged.startDate,
        endDate: merged.endDate,
        notes: merged.notes,
        content,
        generatedContent,
        currentVersion: contract.currentVersion + 1,
        status:
          contract.status === "rejected" ? transition(contract.status, "edit") : contract.status,
        rejectionReason: null,
      };
      await contractService.reconcileSignatories(tx, id, merged.signatories);
      const [updated] = await tx
        .update(contracts)
        .set(changes)
        .where(eq(contracts.id, id))
        .returning();
      await contractService.snapshot(tx, updated!, req.user, "Edición de contrato");
      await contractService.record(tx, req, contract, "edit", contract, updated);
    });
    return detail(req, id);
  });
  for (const action of [
    "submit",
    "approve",
    "reject",
    "cancel",
    "uncancel",
    "archive",
    "unarchive",
    "override-status",
    "remind",
    "decline",
  ] as const) {
    app.post("/contracts/:id/" + action, auth, async (req) => {
      const id = idOf(req);
      await db.transaction(async (tx) => {
        const contract = await contractService.getContract(tx, id, true);
        await contractService.linkSignatories(tx, req.user);
        const allSignatories = await contractService.getSignatories(tx, id);
        if (!contractService.canRead(contract, req.user, allSignatories))
          throw contractService.notFound();
        const input = parse(actionInput, req.body ?? {});
        const { next, changes } = await applyContractAction({
          tx,
          req,
          contract,
          allSignatories,
          input,
          id,
          action,
        });

        const [updated] = await tx
          .update(contracts)
          .set({ ...changes, status: next, updatedAt: new Date() })
          .where(eq(contracts.id, id))
          .returning();
        if (next === "active" && contract.status !== "active")
          await activateRenewalParent(tx, updated!, req.user.id);
        if (action === "override-status" && next === "draft")
          await contractService.snapshot(
            tx,
            updated!,
            req.user,
            "Reapertura administrativa",
            await historicalDefinitions(tx, contract),
          );
        await contractService.record(tx, req, contract, action, contract, {
          ...updated,
          reason: input.reason,
          comment: input.comment,
        });
      });
      return detail(req, id);
    });
  }
  app.delete("/contracts/:id", auth, async (req) =>
    withStorageMutation(async () => {
      const id = idOf(req);
      let paths: string[] = [];
      let pdfPath: string | null = null;
      await db.transaction(async (tx) => {
        const contract = await contractService.getContract(tx, id, true);
        const allSignatories = await contractService.getSignatories(tx, id);
        if (!(
          req.user.role === "admin" ||
          (req.user.role === "gestor" && contract.createdBy === req.user.id)
        ))
          throw contractService.notFound();
        if (!contractService.permissions(contract, req.user, allSignatories).delete)
          throw contractService.conflict(
            "Un contrato firmado o en proceso no se puede eliminar: cancélalo o archívalo.",
          );
        paths = (
          await tx
            .select({ path: files.path })
            .from(files)
            .where(and(eq(files.contractId, id), eq(files.kind, "signature")))
        ).map((f) => f.path);
        if (paths.length) await tx.delete(files).where(inArray(files.path, paths));
        pdfPath = contract.signedPdfPath;
        await contractService.record(tx, req, contract, "delete", contract, null);
        await tx.delete(contracts).where(eq(contracts.id, id));
      });
      await removeSignatureFiles(paths);
      if (pdfPath) await removeFinalPdf(pdfPath);
      return { message: "Contrato eliminado." };
    }),
  );
  for (const kind of ["versions", "audit", "approvals"] as const) {
    app.get("/contracts/:id/" + kind, auth, async (req) => {
      const id = idOf(req);
      await detail(req, id);
      if (kind === "versions")
        return db
          .select()
          .from(versions)
          .where(eq(versions.contractId, id))
          .orderBy(versions.versionNumber);
      if (kind === "approvals")
        return db
          .select()
          .from(approvals)
          .where(eq(approvals.contractId, id))
          .orderBy(approvals.requestedAt);
      const pagination = parse(pageInput, req.query);
      const data = await db
        .select()
        .from(logs)
        .where(eq(logs.contractId, id))
        .orderBy(sql`${logs.createdAt} desc`, logs.id)
        .limit(pagination.pageSize)
        .offset((pagination.page - 1) * pagination.pageSize);
      const [count] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(logs)
        .where(eq(logs.contractId, id));
      return { data, meta: { ...pagination, total: count!.n } };
    });
  }
  app.get("/contracts/:id/versions/:n", auth, async (req) => {
    const id = idOf(req);
    await detail(req, id);
    const versionNumber = parse(
      z.coerce.number().int().positive(),
      (req.params as { n: string }).n,
    );
    const [variable] = await db
      .select()
      .from(versions)
      .where(and(eq(versions.contractId, id), eq(versions.versionNumber, versionNumber)));
    if (!variable) throw contractService.notFound();
    return variable;
  });
  app.get("/approvals", { preHandler: requireRole("admin", "supervisor") }, async (req) => {
    const query = parse(
      z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") }),
      req.query,
    );
    const rows = await db
      .select()
      .from(approvals)
      .where(eq(approvals.status, query.status))
      .orderBy(approvals.requestedAt);
    return Promise.all(
      rows.map(async (approval) => {
        const contract = await contractService.getContract(db, approval.contractId);
        const [requester] = approval.requestedBy
          ? await db
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(eq(users.id, approval.requestedBy))
          : [];
        const versionHistory = await db
          .select()
          .from(versions)
          .where(eq(versions.contractId, contract.id))
          .orderBy(sql`${versions.versionNumber} desc`);
        const previousReviews = await db
          .select()
          .from(approvals)
          .where(
            and(
              eq(approvals.contractId, contract.id),
              sql`${approvals.status}<>'pending'`,
              sql`${approvals.requestedAt}<${approval.requestedAt}`,
            ),
          )
          .orderBy(sql`${approvals.requestedAt} desc`)
          .limit(1);
        const current = versionHistory.find(
          (item) => item.versionNumber === approval.versionNumber,
        );
        const previousVersion = versionHistory.find(
          (item) => item.versionNumber === previousReviews[0]?.versionNumber,
        );
        return {
          ...approval,
          contract: await contractService.decorate(db, contract),
          requester: requester ?? null,
          ageSeconds: Math.floor((Date.now() - approval.requestedAt.getTime()) / 1000),
          version: current ?? null,
          diff:
            previousVersion && current
              ? {
                  previousVersion: previousVersion.versionNumber,
                  contentChanged: previousVersion.content !== current.content,
                  variablesChanged:
                    JSON.stringify(previousVersion.variablesData) !==
                    JSON.stringify(current.variablesData),
                  detailsChanged:
                    JSON.stringify(previousVersion.snapshot) !== JSON.stringify(current.snapshot),
                }
              : null,
        };
      }),
    );
  });
  await adminContractRoutes(app, detail);
  await signatureRoutes(app);
}
