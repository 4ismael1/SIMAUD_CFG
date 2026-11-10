import { amendmentRoutes } from "./amendment-routes.js";
import { hasOpenAmendment, hasOpenRenewal, mirrorAmendmentEvent } from "./amendments.js";
import { canResetSignature } from "./amendment-permissions.js";
import { ownSignatureSlot } from "./signature-placement.js";
import { listContracts, contractListQuery } from "./list-queries.js";
import { listApprovals, approvalQuery, getPendingApprovalRequester } from "./approval-queries.js";
import { contentInput, contentResponse, encodeContent } from "../../lib/rich-doc/content.js";
import { historicalDefinitions, lockVariableCatalog } from "./variable-history.js";
import { applyContractAction } from "./actions.js";
import { adminContractRoutes } from "./admin-routes.js";
import { canReassign } from "./admin-actions.js";
import { activateRenewalParent } from "../renewals/routes.js";
import { removeFinalPdf } from "./pdf.js";
import { withRequestStorageMutation } from "../../lib/storage.js";
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
  const auth = { preHandler: authenticate };
  const staff = { preHandler: requireRole("admin", "supervisor", "gestor") };
  const idOf = (req: FastifyRequest) => parse(uuid, (req.params as { id: string }).id);
  async function detail(req: FastifyRequest, id: string) {
    return db.transaction(async (tx) => {
      const contract = await contractService.getContract(tx, id, true);
      await contractService.linkSignatories(tx, req.user, id);
      const allSignatories = await contractService.getSignatories(tx, id);
      if (!contractService.canRead(contract, req.user, allSignatories))
        throw contractService.notFound();
      const signatureFiles = await tx
        .select({ id: files.id, path: files.path })
        .from(files)
        .where(and(eq(files.contractId, id), eq(files.kind, "signature")));
      const requestedBy = await getPendingApprovalRequester(tx, id);
      return {
        ...(await contractService.decorate(tx, contract)),
        signatories: allSignatories.map((item) => ({
          ...item,
          canResetSignature: canResetSignature(contract, req.user, item),
          signatureFileId: signatureFiles.find((f) => f.path === item.signaturePath)?.id ?? null,
        })),
        signatureSlot: await ownSignatureSlot(tx, contract, allSignatories, req.user.id),
        can: {
          ...contractService.permissions(contract, req.user, allSignatories, requestedBy),
          amend:
            contractService.permissions(contract, req.user, allSignatories).amend &&
            !(await hasOpenAmendment(tx, contract)) &&
            !(await hasOpenRenewal(tx, contract.id)),
          reassign: canReassign(contract, req.user),
        },
      };
    });
  }
  app.get("/contracts", staff, async (req) =>
    listContracts(req.user, parse(contractListQuery, req.query)),
  );
  app.get("/contracts/counts", staff, async (req) => {
    const query = parse(
      z.object({ archived: z.enum(["true", "false"]).default("false") }).strict(),
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
      const content =
        input.content === undefined
          ? template.content
          : encodeContent(input.content, template.contentFormat);
      const generatedContent = await contractService.prepareContent(
        tx,
        content,
        input.variables,
        true,
        undefined,
        template.contentFormat,
      );
      const [contract] = await tx
        .insert(contracts)
        .values({
          templateId: template.id,
          title: input.title,
          content,
          contentFormat: template.contentFormat,
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
        contractFields.partial().extend({ content: contentInput.optional() }).strict(),
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
      let format = contract.contentFormat;
      let content = contract.content;
      if (patch.templateId && patch.templateId !== contract.templateId) {
        const [template] = await tx
          .select()
          .from(contractTemplates)
          .where(eq(contractTemplates.id, patch.templateId))
          .for("share");
        if (!template || (req.user.role === "gestor" && template.status !== "active"))
          throw contractService.invalid("Plantilla no disponible.");
        format = template.contentFormat;
        if (contract.contentFormat !== "plain" && format === "plain")
          throw contractService.invalid(
            "Un contrato con formato no se puede convertir a texto plano.",
          );
        content = template.content;
      }
      if (patch.content !== undefined) content = encodeContent(patch.content, format);
      const generatedContent = await contractService.prepareContent(
        tx,
        content,
        merged.variables,
        patch.variables !== undefined,
        undefined,
        format,
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
        contentFormat: format,
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
        await contractService.linkSignatories(tx, req.user, id);
        const allSignatories = await contractService.getSignatories(tx, id);
        if (!contractService.canRead(contract, req.user, allSignatories))
          throw contractService.notFound();
        const input = parse(actionInput, req.body ?? {});
        const { next, changes, auditAction } = await applyContractAction({
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
        await mirrorAmendmentEvent(tx, req, contract, auditAction ?? action, { status: next });
        await contractService.record(tx, req, contract, auditAction ?? action, contract, {
          ...updated,
          reason: input.reason,
          comment: input.comment,
        });
      });
      return detail(req, id);
    });
  }
  app.delete("/contracts/:id", auth, async (req, reply) =>
    withRequestStorageMutation(req, reply, async () => {
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
      const pagination = parse(pageInput, req.query);
      if (kind === "versions")
        return (
          await db
            .select()
            .from(versions)
            .where(eq(versions.contractId, id))
            .orderBy(versions.versionNumber)
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize)
        ).map(contentResponse);
      if (kind === "approvals")
        return (
          await db
            .select()
            .from(approvals)
            .where(eq(approvals.contractId, id))
            .orderBy(approvals.requestedAt, approvals.id)
            .limit(pagination.pageSize)
            .offset((pagination.page - 1) * pagination.pageSize)
        ).map(({ originalRequestedBy: _origin, ...approval }) => approval);
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
    const { id, n: versionNumber } = parse(
      z.object({ id: uuid, n: z.coerce.number().int().min(1).max(2147483647) }).strict(),
      req.params,
    );
    await detail(req, id);
    const [variable] = await db
      .select()
      .from(versions)
      .where(and(eq(versions.contractId, id), eq(versions.versionNumber, versionNumber)));
    if (!variable) throw contractService.notFound();
    return contentResponse(variable);
  });
  app.get("/approvals", { preHandler: requireRole("admin", "supervisor") }, async (req) =>
    listApprovals(req.user, parse(approvalQuery, req.query)),
  );
  await adminContractRoutes(app, detail);
  await signatureRoutes(app);
  await amendmentRoutes(app);
}
