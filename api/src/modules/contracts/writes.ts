import type { FastifyRequest } from "fastify";
import type { z } from "zod";
import { eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client.js";
import { contracts, contractTemplates } from "../../db/schema.js";
import { encodeContent } from "../../lib/rich-doc/content.js";
import { partyDefinitions } from "../../lib/rich-doc/slots.js";
import type { ContentFormat } from "../../lib/rich-doc/types.js";
import { lockVariableCatalog } from "./variable-history.js";
import { prepareSlotSignatories, assertSameSlots, fillPartyValues } from "./slot-signatories.js";
import { contractFields, contractInput, contractRelations, values, parse } from "./schemas.js";
import { transition } from "./state-machine.js";
import * as service from "./service.js";

type ContractInput = z.infer<typeof contractInput>;
type ContractPatch = Partial<z.infer<typeof contractFields>>;
type DocumentSource = { content: string; contentFormat: ContentFormat };

export async function createContract(req: FastifyRequest, input: ContractInput) {
  return db.transaction(async (tx) => {
    await lockVariableCatalog(tx);
    const template = await availableTemplate(tx, input.templateId, req.user);
    const document = editedDocument(template, input.content);
    const prepared = await prepareWrite(
      tx,
      document,
      input.signatories,
      input.variables,
      input.variables,
    );
    const { signatories, ...documentData } = prepared;
    const contract = await insertContract(tx, req.user.id, input, documentData);
    await service.reconcileSignatories(tx, contract.id, signatories);
    await service.snapshot(tx, contract, req.user, "Creación");
    await service.record(tx, req, contract, "create", null, { ...contract, signatories });
    return contract;
  });
}

export async function updateContract(req: FastifyRequest, id: string, patch: ContractPatch) {
  await db.transaction(async (tx) => {
    await lockVariableCatalog(tx);
    const contract = await service.getContract(tx, id, true);
    const previousSignatories = await service.getSignatories(tx, id);
    assertEditable(contract, req.user, previousSignatories, patch);
    const merged = mergeContractPatch(contract, previousSignatories, patch);
    parse(contractRelations, merged);
    const source = await patchSource(tx, contract, patch.templateId, req.user);
    const document = editedDocument(source, patch.content);
    const variables = retainedVariables(contract, document, merged.variables, patch.variables);
    const prepared = await prepareWrite(
      tx,
      document,
      merged.signatories,
      variables,
      patch.variables,
    );
    const { signatories, ...documentData } = prepared;
    const [updated] = await tx
      .update(contracts)
      .set({
        ...contractChanges(contract, merged),
        ...documentData,
      })
      .where(eq(contracts.id, id))
      .returning();
    await service.reconcileSignatories(tx, id, signatories);
    await service.snapshot(tx, updated!, req.user, "Edición de contrato");
    await service.record(
      tx,
      req,
      contract,
      "edit",
      { ...contract, signatories: previousSignatories },
      { ...updated, signatories },
    );
  });
}

async function availableTemplate(tx: Transaction, id: string, actor: service.Actor) {
  const [template] = await tx
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.id, id))
    .for("share");
  if (!template || (actor.role === "gestor" && template.status !== "active"))
    throw service.invalid("Plantilla no disponible.");
  return template;
}

function editedDocument(source: DocumentSource, input?: unknown): DocumentSource {
  const content = input === undefined ? source.content : encodeContent(input, source.contentFormat);
  assertSameSlots(source.content, content, source.contentFormat);
  return { content, contentFormat: source.contentFormat };
}

async function prepareWrite(
  tx: Transaction,
  document: DocumentSource,
  input: ContractInput["signatories"],
  existingValues: Record<string, unknown>,
  submitted?: Record<string, unknown>,
) {
  const { content, contentFormat } = document;
  const signatories = prepareSlotSignatories(content, contentFormat, input);
  const variablesData = { ...existingValues };
  await fillPartyValues(tx, content, contentFormat, signatories, variablesData, submitted);
  const generatedContent = await service.prepareContent(
    tx,
    content,
    variablesData,
    submitted !== undefined,
    undefined,
    contentFormat,
  );
  return { ...document, generatedContent, variablesData, signatories };
}

type PreparedDocument = Omit<Awaited<ReturnType<typeof prepareWrite>>, "signatories">;
async function insertContract(
  tx: Transaction,
  actorId: string,
  input: ContractInput,
  document: PreparedDocument,
) {
  const [contract] = await tx
    .insert(contracts)
    .values({
      ...document,
      templateId: input.templateId,
      title: input.title,
      contractValue: String(input.value),
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      createdBy: actorId,
    })
    .returning();
  return contract!;
}

function assertEditable(
  contract: service.Contract,
  actor: service.Actor,
  signatories: service.Signatory[],
  patch: ContractPatch,
) {
  if (!(actor.role === "admin" || (actor.role === "gestor" && contract.createdBy === actor.id)))
    throw service.notFound();
  if (!service.permissions(contract, actor, signatories).edit) throw service.conflict();
  if (!Object.keys(patch).length) throw service.invalid("Debe indicar algún cambio.");
}

function mergeContractPatch(
  contract: service.Contract,
  previous: service.Signatory[],
  patch: ContractPatch,
) {
  return {
    templateId: patch.templateId ?? contract.templateId,
    title: patch.title ?? contract.title,
    variables: patch.variables ?? parse(values, contract.variablesData),
    value: patch.value ?? contract.contractValue ?? "0",
    startDate: patch.startDate ?? contract.startDate,
    endDate: patch.endDate ?? contract.endDate,
    notes: patch.notes === undefined ? contract.notes : patch.notes,
    signatories:
      patch.signatories ??
      previous.map((item) => ({
        name: item.name,
        email: item.email,
        phone: item.phone ?? undefined,
        cedula: item.cedula ?? undefined,
        role: item.role,
        slotIndex: item.slotIndex,
        signingOrder: item.signingOrder,
      })),
  };
}

async function patchSource(
  tx: Transaction,
  contract: service.Contract,
  templateId: string | undefined,
  actor: service.Actor,
): Promise<DocumentSource> {
  if (!templateId || templateId === contract.templateId) return contract;
  const template = await availableTemplate(tx, templateId, actor);
  if (contract.contentFormat !== "plain" && template.contentFormat === "plain")
    throw service.invalid("Un contrato con formato no se puede convertir a texto plano.");
  return template;
}

function retainedVariables(
  previous: DocumentSource,
  document: DocumentSource,
  existing: Record<string, unknown>,
  submitted?: Record<string, unknown>,
) {
  const variables = { ...existing };
  if (submitted !== undefined) return variables;
  const currentImplicit = new Set(
    partyDefinitions(document.content, document.contentFormat).map((definition) => definition.name),
  );
  for (const definition of partyDefinitions(previous.content, previous.contentFormat))
    if (!currentImplicit.has(definition.name)) delete variables[definition.name];
  return variables;
}

function contractChanges(
  contract: service.Contract,
  merged: ReturnType<typeof mergeContractPatch>,
) {
  return {
    templateId: merged.templateId,
    title: merged.title,
    contractValue: String(merged.value),
    startDate: merged.startDate,
    endDate: merged.endDate,
    notes: merged.notes,
    currentVersion: contract.currentVersion + 1,
    status: contract.status === "rejected" ? transition(contract.status, "edit") : contract.status,
    rejectionReason: null,
  };
}
