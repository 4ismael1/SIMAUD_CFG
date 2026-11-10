import { activateRenewalParent } from "../renewals/routes.js";
import { removeFinalPdf } from "./pdf.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import {
  contracts,
  contractSignatories as signatories,
  contractApprovals as approvals,
  contractCancellations as cancellations,
  contractVersions as versions,
  contractAuditLogs as logs,
  users,
  contractTemplates,
  contractStatus,
  files,
} from "../../db/schema.js";
import { authenticate, requireRole } from "../../plugins/auth.js";
import type { Mail, Mailer } from "../../lib/mailer.js";
import {
  parse,
  uuid,
  contractInput,
  contractFields,
  pageInput,
  actionInput,
  cancelInput,
  text,
} from "./schemas.js";
import { transition, overrideTransition } from "./state-machine.js";
import * as contractService from "./service.js";
import { signatureRoutes, removeSignatureFiles } from "./signatures.js";
export async function contractRoutes(app: FastifyInstance, mailer: Mailer) {
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
        can: contractService.permissions(contract, req.user, allSignatories),
      };
    });
  }
  const listSchema = pageInput.extend({
    status: z.enum(contractStatus.enumValues).optional(),
    q: z.string().optional(),
    templateId: uuid.optional(),
    createdBy: uuid.optional(),
    expiresBefore: z.iso.date().optional(),
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
    const where = and(
      req.user.role === "gestor" ? eq(contracts.createdBy, req.user.id) : undefined,
      query.status ? eq(contracts.status, query.status) : undefined,
      query.templateId ? eq(contracts.templateId, query.templateId) : undefined,
      query.createdBy ? eq(contracts.createdBy, query.createdBy) : undefined,
      eq(contracts.archived, query.archived === "true"),
      query.expiresBefore ? sql`${contracts.endDate}<${query.expiresBefore}` : undefined,
      query.q
        ? sql`(${contracts.title} ilike ${"%" + query.q + "%"} OR ${contracts.code} ilike ${"%" + query.q + "%"})`
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
      const merged = parse(contractInput, {
        templateId: patch.templateId ?? contract.templateId,
        title: patch.title ?? contract.title,
        variables: patch.variables ?? contract.variablesData,
        value: patch.value ?? Number(contract.contractValue),
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
      });
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
      const generatedContent = await contractService.prepareContent(tx, content, merged.variables);
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
      const mails: Mail[] = [];
      await db.transaction(async (tx) => {
        const contract = await contractService.getContract(tx, id, true);
        await contractService.linkSignatories(tx, req.user);
        const allSignatories = await contractService.getSignatories(tx, id);
        if (!contractService.canRead(contract, req.user, allSignatories))
          throw contractService.notFound();
        const can = contractService.permissions(contract, req.user, allSignatories);
        const input = parse(actionInput, req.body ?? {});
        const creator = [{ userId: contract.createdBy }];
        let next = contract.status;
        let changes: Partial<typeof contracts.$inferInsert> = {};
        if (action === "archive" || action === "unarchive") {
          if (!can.archive) throw contractService.forbidden();
          if (contract.archived === (action === "archive")) throw contractService.conflict();
          changes = {
            archived: action === "archive",
            archivedAt: action === "archive" ? new Date() : null,
            archivedBy: action === "archive" ? req.user.id : null,
          };
        } else if (action === "remind") {
          if (!contractService.canManage(contract, req.user)) throw contractService.forbidden();
          if (contract.status !== "pending_signatures") throw contractService.conflict();
          const target = allSignatories.find((item) => item.id === input.signatoryId);
          if (
            !target ||
            target.status !== "pending" ||
            allSignatories.some(
              (item) => item.signingOrder < target.signingOrder && item.status !== "signed",
            )
          )
            throw contractService.conflict("El firmante no tiene turno.");
          if (target.lastRemindedAt && Date.now() - target.lastRemindedAt.getTime() < 3600000)
            throw new (await import("../../lib/errors.js")).ApiError(
              429,
              "RATE_LIMITED",
              "Solo se permite un recordatorio por hora.",
            );
          await tx
            .update(signatories)
            .set({ lastRemindedAt: new Date() })
            .where(eq(signatories.id, target.id));
          await contractService.notify(
            tx,
            contract,
            "signature_required",
            [target],
            "Recordatorio: tu firma es requerida.",
            mails,
          );
        } else if (action === "submit") {
          if (!can.submit) {
            if (
              !["admin", "gestor"].includes(req.user.role) ||
              (req.user.role === "gestor" && contract.createdBy !== req.user.id)
            )
              throw contractService.forbidden();
            throw contractService.conflict();
          }
          next = transition(contract.status, "submit");
          await tx
            .update(signatories)
            .set({ status: "pending" })
            .where(and(eq(signatories.contractId, id), eq(signatories.status, "declined")));
          await tx.insert(approvals).values({
            contractId: id,
            versionNumber: contract.currentVersion,
            requestedBy: req.user.id,
          });
          const reviewers = await tx
            .select({ userId: users.id })
            .from(users)
            .where(
              and(
                inArray(users.role, ["admin", "supervisor"]),
                eq(users.isActive, true),
                isNull(users.deletedAt),
              ),
            );
          await contractService.notify(
            tx,
            contract,
            "approval_needed",
            reviewers,
            "Contrato pendiente de aprobación.",
            mails,
          );
        } else if (action === "approve" || action === "reject") {
          if (!(
            req.user.role === "admin" ||
            (req.user.role === "supervisor" && contract.createdBy !== req.user.id)
          ))
            throw contractService.forbidden();
          next = transition(contract.status, action);
          if (action === "reject" && !input.comment)
            throw contractService.invalid("El comentario es obligatorio.");
          const [pending] = await tx
            .update(approvals)
            .set({
              status: action === "approve" ? "approved" : "rejected",
              reviewedBy: req.user.id,
              reviewedAt: new Date(),
              comments: input.comment,
            })
            .where(and(eq(approvals.contractId, id), eq(approvals.status, "pending")))
            .returning();
          if (!pending) throw contractService.conflict("No hay aprobación pendiente.");
          changes =
            action === "approve"
              ? { approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: null }
              : { rejectionReason: input.comment };
          await contractService.notify(
            tx,
            contract,
            "approval_result",
            creator,
            action === "approve" ? "Contrato aprobado." : "Contrato rechazado: " + input.comment,
            mails,
          );
          if (action === "approve") await contractService.nextSigners(tx, contract, mails);
        } else if (action === "cancel") {
          if (!contractService.canManage(contract, req.user)) throw contractService.forbidden();
          const cancel = parse(cancelInput, req.body);
          next = transition(contract.status, "cancel");
          changes = { previousStatus: contract.status };
          await tx.insert(cancellations).values({
            contractId: id,
            cancelledBy: req.user.id,
            reason: cancel.reason,
            description: cancel.description,
            status: "approved",
            approvedBy: req.user.id,
            approvedAt: new Date(),
          });
          await contractService.notify(
            tx,
            contract,
            "contract_cancelled",
            [...creator, ...allSignatories],
            "Contrato cancelado: " + cancel.description,
            mails,
          );
        } else if (action === "uncancel") {
          if (req.user.role !== "admin") throw contractService.forbidden();
          next = transition(contract.status, "uncancel", contract.previousStatus);
          changes = { previousStatus: null };
          if (next === "pending_signatures") await contractService.nextSigners(tx, contract, mails);
        } else if (action === "decline") {
          const me = allSignatories.find((item) => item.userId === req.user.id);
          if (!me) throw contractService.forbidden();
          if (me.status !== "pending") throw contractService.conflict();
          if (!input.reason) throw contractService.invalid("El motivo es obligatorio.");
          next = transition(contract.status, "decline");
          await tx.update(signatories).set({ status: "declined" }).where(eq(signatories.id, me.id));
          changes = { rejectionReason: input.reason };
          await contractService.notify(
            tx,
            contract,
            "approval_result",
            creator,
            "Firma rechazada: " + input.reason,
            mails,
          );
        } else {
          if (!can.override) throw contractService.forbidden();
          if (!input.reason || !input.status)
            throw contractService.invalid("Estado y motivo obligatorios.");
          next = overrideTransition(contract.status, input.status, contract.previousStatus);
          if (next === "pending_approval") {
            await tx
              .update(signatories)
              .set({ status: "pending" })
              .where(and(eq(signatories.contractId, id), eq(signatories.status, "declined")));
            await tx.insert(approvals).values({
              contractId: id,
              versionNumber: contract.currentVersion,
              requestedBy: req.user.id,
            });
            const reviewers = await tx
              .select({ userId: users.id })
              .from(users)
              .where(
                and(
                  inArray(users.role, ["admin", "supervisor"]),
                  eq(users.isActive, true),
                  isNull(users.deletedAt),
                ),
              );
            await contractService.notify(
              tx,
              contract,
              "approval_needed",
              reviewers,
              "Aprobación solicitada por administrador.",
              mails,
            );
          }
          if (
            contract.status === "pending_approval" &&
            (next === "pending_signatures" || next === "rejected")
          ) {
            const [review] = await tx
              .update(approvals)
              .set({
                status: next === "rejected" ? "rejected" : "approved",
                reviewedBy: req.user.id,
                reviewedAt: new Date(),
                comments: input.reason,
              })
              .where(and(eq(approvals.contractId, id), eq(approvals.status, "pending")))
              .returning();
            if (!review) throw contractService.conflict("No hay aprobación pendiente.");
            if (next === "pending_signatures")
              changes = { approvedBy: req.user.id, approvedAt: new Date(), rejectionReason: null };
            await contractService.notify(
              tx,
              contract,
              "approval_result",
              creator,
              "Decisión administrativa: " + input.reason,
              mails,
            );
          }
          if (next === "rejected") {
            changes.rejectionReason = input.reason;
            if (contract.status !== "pending_approval")
              await contractService.notify(
                tx,
                contract,
                "approval_result",
                creator,
                "Contrato rechazado: " + input.reason,
                mails,
              );
          }
          if (next === "pending_signatures") await contractService.nextSigners(tx, contract, mails);
          if (next === "active" && contract.status !== "cancelled")
            await contractService.notify(
              tx,
              contract,
              "contract_signed",
              [...creator, ...allSignatories],
              "Contrato activado por administrador: " + input.reason,
              mails,
            );
          if (next === "cancelled") {
            changes.previousStatus = contract.status;
            await tx.insert(cancellations).values({
              contractId: id,
              cancelledBy: req.user.id,
              reason: "other",
              description: input.reason,
              status: "approved",
              approvedBy: req.user.id,
              approvedAt: new Date(),
            });
            await contractService.notify(
              tx,
              contract,
              "contract_cancelled",
              [...creator, ...allSignatories],
              "Contrato cancelado: " + input.reason,
              mails,
            );
          }
          if (contract.status === "cancelled") changes.previousStatus = null;
          if (next === "draft") {
            changes.currentVersion = contract.currentVersion + 1;
            await tx
              .update(signatories)
              .set({
                status: "pending",
                signaturePath: null,
                signedAt: null,
                viewedAt: null,
                acceptedDeclarationAt: null,
                ip: null,
                userAgent: null,
              })
              .where(eq(signatories.contractId, id));
          }
        }
        const [updated] = await tx
          .update(contracts)
          .set({ ...changes, status: next, updatedAt: new Date() })
          .where(eq(contracts.id, id))
          .returning();
        if (next === "active" && contract.status !== "active")
          await activateRenewalParent(tx, updated!, req.user.id);
        if (action === "override-status" && next === "draft")
          await contractService.snapshot(tx, updated!, req.user, "Reapertura administrativa");
        await contractService.record(tx, req, contract, action, contract, {
          ...updated,
          reason: input.reason,
          comment: input.comment,
        });
      });
      for (const mail of mails) await mailer(mail);
      return detail(req, id);
    });
  }
  app.delete("/contracts/:id", auth, async (req) => {
    const id = idOf(req);
    let paths: string[] = [];
    let pdfPath: string | null = null;
    await db.transaction(async (tx) => {
      const contract = await contractService.getContract(tx, id, true);
      const allSignatories = await contractService.getSignatories(tx, id);
      if (!contractService.permissions(contract, req.user, allSignatories).delete)
        throw contractService.forbidden();
      if (
        req.user.role === "admin" &&
        parse(z.object({ confirm: text }).strict(), req.body ?? {}).confirm !== contract.code
      )
        throw contractService.invalid("Confirma con el código del contrato.");
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
  });
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
  await signatureRoutes(app, mailer);
}
