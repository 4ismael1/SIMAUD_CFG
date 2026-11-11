import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  numeric,
  date,
  jsonb,
  bigint,
  index,
  uniqueIndex,
  check,
  primaryKey,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
const id = () => uuid("id").defaultRandom().primaryKey();
const time = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = () => ({
  createdAt: time("created_at").defaultNow().notNull(),
  updatedAt: time("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export const userRole = pgEnum("user_role", ["admin", "supervisor", "gestor", "user"]);
export type Role = (typeof userRole.enumValues)[number];
export const contractStatus = pgEnum("contract_status", [
  "draft",
  "pending_approval",
  "rejected",
  "pending_signatures",
  "active",
  "expiring_soon",
  "expired",
  "cancelled",
  "renewed",
  "amended",
]);
export const signatoryRole = pgEnum("signatory_role", ["client", "witness", "contractor"]);
export const signatoryStatus = pgEnum("signatory_status", ["pending", "signed", "declined"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected"]);
export const renewalStatus = pgEnum("renewal_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const priority = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const variableType = pgEnum("variable_type", [
  "text",
  "date",
  "number",
  "select",
  "textarea",
  "money",
]);
export const templateStatus = pgEnum("template_status", ["active", "inactive"]);
export const cancellationReason = pgEnum("cancellation_reason", [
  "breach",
  "mutual_agreement",
  "client_request",
  "payment_default",
  "other",
]);
export const authTokenType = pgEnum("auth_token_type", ["email_confirmation", "password_reset"]);
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    credentialsVersion: integer("credentials_version").default(0).notNull(),
    mustChangePassword: boolean("must_change_password").default(false).notNull(),
    name: text("name").notNull(),
    position: text("position"),
    phone: text("phone").notNull().default(""),
    cedula: text("cedula").notNull().default(""),
    role: userRole("role").default("user").notNull(),
    notificationPreferences: jsonb("notification_preferences")
      .$type<{
        emailOnSignatureRequired: boolean;
        emailOnApprovalResult: boolean;
        emailOnExpiry: boolean;
      }>()
      .default({ emailOnSignatureRequired: true, emailOnApprovalResult: true, emailOnExpiry: true })
      .notNull(),
    avatarPath: text("avatar_path"),
    signatureStyle: jsonb("signature_style").$type<{ text: string; fontId: string }>(),
    pendingEmail: text("pending_email"),
    emailConfirmedAt: time("email_confirmed_at"),
    isActive: boolean("is_active").default(true).notNull(),
    deletedAt: time("deleted_at"),
    lastLoginAt: time("last_login_at"),
    invitedAt: time("invited_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_cedula_unique")
      .on(t.cedula)
      .where(sql`${t.cedula} <> ''`),
    check("users_email_lower", sql`${t.email} = lower(trim(${t.email}))`),
    check("users_position_length", sql`char_length(${t.position}) <= 120`),
    index("users_role_idx").on(t.role),
    index("users_created_idx").on(t.createdAt),
  ],
);
const userRef = (name: string) => uuid(name).references(() => users.id, { onDelete: "set null" });
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    familyId: uuid("family_id").notNull(),
    expiresAt: time("expires_at").notNull(),
    revokedAt: time("revoked_at"),
    replacedBy: uuid("replaced_by").references((): AnyPgColumn => refreshTokens.id, {
      onDelete: "set null",
    }),
    userAgent: text("user_agent"),
    ip: text("ip"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("refresh_user_idx").on(t.userId),
    index("refresh_family_idx").on(t.familyId),
    index("refresh_active_family_idx")
      .on(t.familyId, t.userId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenType("type").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    expiresAt: time("expires_at").notNull(),
    usedAt: time("used_at"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [index("auth_user_type_idx").on(t.userId, t.type)],
);
export const templateVariables = pgTable("template_variables", {
  id: id(),
  name: text("name").notNull().unique(),
  label: text("label").notNull(),
  type: variableType("type").notNull(),
  options: text("options").array(),
  required: boolean("required").default(false).notNull(),
  description: text("description"),
  ...timestamps(),
});
export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: id(),
    title: text("title").notNull(),
    contentFormat: text("content_format")
      .$type<"plain" | "rich-v1" | "rich-v2">()
      .default("plain")
      .notNull(),
    content: text("content").notNull(),
    description: text("description"),
    category: text("category").default("general").notNull(),
    variables: text("variables")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    status: templateStatus("status").default("active").notNull(),
    createdBy: userRef("created_by"),
    ...timestamps(),
  },
  (t) => [
    index("templates_status_idx").on(t.status),
    index("templates_creator_idx").on(t.createdBy),
    check("templates_content_format", sql`${t.contentFormat} IN ('plain','rich-v1','rich-v2')`),
  ],
);
export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    templateId: uuid("template_id").references(() => contractTemplates.id, {
      onDelete: "set null",
    }),
    code: text("code")
      .default(sql`next_contract_code()`)
      .notNull()
      .unique(),
    signedPdfPath: text("signed_pdf_path"),
    signedPdfSha256: text("signed_pdf_sha256"),
    verificationCode: text("verification_code").unique(),
    documentSha256: text("document_sha256"),
    activatedAt: time("activated_at"),
    revokedAt: time("revoked_at"),
    systemSeal: jsonb("system_seal").$type<import("../lib/crypto/system-signing.js").SystemSeal>(),
    auditHead: text("audit_head"),
    auditCount: integer("audit_count").default(0).notNull(),
    evidenceHead: text("evidence_head"),
    evidenceCount: integer("evidence_count").default(0).notNull(),
    everSigned: boolean("ever_signed").default(false).notNull(),
    everApproved: boolean("ever_approved").default(false).notNull(),
    amendsContractId: uuid("amends_contract_id").references((): AnyPgColumn => contracts.id, {
      onDelete: "restrict",
    }),
    amendmentRootId: uuid("amendment_root_id").references((): AnyPgColumn => contracts.id, {
      onDelete: "restrict",
    }),
    amendedByContractId: uuid("amended_by_contract_id").references(
      (): AnyPgColumn => contracts.id,
      { onDelete: "restrict" },
    ),
    amendmentNumber: integer("amendment_number"),
    amendmentSequence: integer("amendment_sequence").default(0).notNull(),
    amendmentReason: text("amendment_reason"),
    previousStatus: contractStatus("previous_status"),
    title: text("title").notNull(),
    contentFormat: text("content_format")
      .$type<"plain" | "rich-v1" | "rich-v2">()
      .default("plain")
      .notNull(),
    content: text("content").notNull(),
    generatedContent: text("generated_content"),
    variablesData: jsonb("variables_data").default({}).notNull(),
    clientName: text("client_name"),
    clientEmail: text("client_email"),
    clientPhone: text("client_phone"),
    status: contractStatus("status").default("draft").notNull(),
    archived: boolean("archived").default(false).notNull(),
    archivedAt: time("archived_at"),
    archivedBy: userRef("archived_by"),
    currentVersion: integer("current_version").default(1).notNull(),
    contractValue: numeric("contract_value", { precision: 15, scale: 2 }),
    currency: text("currency").default("DOP").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    parentContractId: uuid("parent_contract_id").references((): AnyPgColumn => contracts.id, {
      onDelete: "set null",
    }),
    renewalType: text("renewal_type").default("original").notNull(),
    autoRenewal: boolean("auto_renewal").default(false).notNull(),
    createdBy: userRef("created_by"),
    originalCreatedBy: uuid("original_created_by"),
    approvedBy: userRef("approved_by"),
    approvedAt: time("approved_at"),
    rejectionReason: text("rejection_reason"),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    index("contracts_status_idx").on(t.status),
    index("contracts_creator_idx").on(t.createdBy),
    index("contracts_end_idx").on(t.endDate),
    index("contracts_archived_idx").on(t.archived),
    index("contracts_parent_idx").on(t.parentContractId),
    index("contracts_amends_idx").on(t.amendsContractId),
    uniqueIndex("contracts_amendment_number").on(t.amendmentRootId, t.amendmentNumber),
    uniqueIndex("contracts_open_amendment")
      .on(t.amendmentRootId)
      .where(sql`${t.status} in ('draft', 'rejected', 'pending_approval', 'pending_signatures')`),
    check(
      "contracts_amendment_fields",
      sql`
      (${t.amendsContractId} is null and ${t.amendmentRootId} is null and ${t.amendmentNumber} is null and ${t.amendmentReason} is null)
      or (${t.amendsContractId} is not null and ${t.amendmentRootId} is not null
        and ${t.amendmentNumber} is not null and ${t.amendmentNumber} > 0
        and ${t.amendmentReason} is not null and length(trim(${t.amendmentReason})) between 1 and 500
        and ${t.amendsContractId} <> ${t.id})
    `,
    ),
    index("contracts_signed_pdf_hash_idx")
      .on(t.signedPdfSha256)
      .where(sql`${t.signedPdfSha256} is not null`),
    check(
      "contracts_dates",
      sql`${t.endDate} IS NULL OR ${t.startDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check("contracts_version_positive", sql`${t.currentVersion} > 0`),
    check("contracts_content_format", sql`${t.contentFormat} IN ('plain','rich-v1','rich-v2')`),
    check(
      "contracts_renewal_type",
      sql`${t.renewalType} IN ('original','manual_renewal','auto_renewal')`,
    ),
  ],
);
const contractRef = () =>
  uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" });
export const contractSignatories = pgTable(
  "contract_signatories",
  {
    id: id(),
    contractId: contractRef(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    cedula: text("cedula"),
    userId: userRef("user_id"),
    role: signatoryRole("role").notNull(),
    roleLabel: text("role_label").default("").notNull(),
    slotIndex: integer("slot_index"),
    status: signatoryStatus("status").default("pending").notNull(),
    signingOrder: integer("signing_order").default(1).notNull(),
    signaturePath: text("signature_path"),
    placement:
      jsonb("placement").$type<import("../lib/signature-placement.js").SignaturePlacement>(),
    viewedAt: time("viewed_at"),
    acceptedDeclarationAt: time("accepted_declaration_at"),
    lastRemindedAt: time("last_reminded_at"),
    signedAt: time("signed_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ...timestamps(),
  },
  (t) => [
    index("signatory_contract_idx").on(t.contractId),
    index("signatory_user_status_idx").on(t.userId, t.status),
    check("signing_order_positive", sql`${t.signingOrder} > 0`),
    check("signatory_slot_nonnegative", sql`${t.slotIndex} >= 0`),
    uniqueIndex("signatory_contract_slot_unique")
      .on(t.contractId, t.slotIndex)
      .where(sql`${t.slotIndex} IS NOT NULL`),
  ],
);
export const contractVersions = pgTable(
  "contract_versions",
  {
    id: id(),
    contractId: contractRef(),
    versionNumber: integer("version_number").notNull(),
    contentFormat: text("content_format")
      .$type<"plain" | "rich-v1" | "rich-v2">()
      .default("plain")
      .notNull(),
    content: text("content").notNull(),
    generatedContent: text("generated_content"),
    variablesData: jsonb("variables_data").default({}).notNull(),
    createdBy: userRef("created_by"),
    createdAt: time("created_at").defaultNow().notNull(),
    changeSummary: text("change_summary"),
    snapshot: jsonb("snapshot").default({}).notNull(),
  },
  (t) => [
    uniqueIndex("versions_contract_number_unique").on(t.contractId, t.versionNumber),
    check("versions_content_format", sql`${t.contentFormat} IN ('plain','rich-v1','rich-v2')`),
  ],
);
export const contractApprovals = pgTable(
  "contract_approvals",
  {
    id: id(),
    contractId: contractRef(),
    versionNumber: integer("version_number").notNull(),
    requestedBy: userRef("requested_by"),
    originalRequestedBy: uuid("original_requested_by"),
    requestedAt: time("requested_at").defaultNow().notNull(),
    reviewedBy: userRef("reviewed_by"),
    reviewedAt: time("reviewed_at"),
    status: approvalStatus("status").default("pending").notNull(),
    comments: text("comments"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("approvals_contract_idx").on(t.contractId),
    index("approvals_status_idx").on(t.status),
    uniqueIndex("approvals_pending_unique")
      .on(t.contractId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
export const contractAuditLogs = pgTable(
  "contract_audit_logs",
  {
    id: id(),
    contractId: uuid("contract_id").references(() => contracts.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    chainContractId: uuid("chain_contract_id"),
    sequence: integer("sequence"),
    entryHash: text("entry_hash"),
    previousHash: text("previous_hash"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    userId: userRef("user_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_contract_created_idx").on(t.contractId, t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
    uniqueIndex("audit_chain_sequence").on(t.chainContractId, t.sequence),
  ],
);
export const signatureEvidence = pgTable(
  "signature_evidence",
  {
    id: id(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "restrict" }),
    signatoryId: uuid("signatory_id").notNull(),
    contractVersion: integer("contract_version").notNull(),
    sequence: integer("sequence").notNull(),
    payload: jsonb("payload")
      .$type<import("../modules/contracts/evidence.js").EvidencePayload>()
      .notNull(),
    previousEvidenceHash: text("previous_evidence_hash"),
    evidenceHash: text("evidence_hash").notNull(),
  },
  (table) => [
    uniqueIndex("evidence_contract_sequence").on(table.contractId, table.sequence),
    index("evidence_signatory_version").on(table.signatoryId, table.contractVersion),
  ],
);

export const contractRenewals = pgTable(
  "contract_renewals",
  {
    id: id(),
    originalContractId: uuid("original_contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    requestedBy: userRef("requested_by"),
    originalRequestedBy: uuid("original_requested_by"),
    requestedAt: time("requested_at").defaultNow().notNull(),
    status: renewalStatus("status").default("pending").notNull(),
    proposedChanges: jsonb("proposed_changes").default({}).notNull(),
    proposedStartDate: date("proposed_start_date"),
    proposedEndDate: date("proposed_end_date"),
    proposedValue: numeric("proposed_value", { precision: 15, scale: 2 }),
    gestorResponse: text("gestor_response"),
    processedBy: userRef("processed_by"),
    processedAt: time("processed_at"),
    newContractId: uuid("new_contract_id").references(() => contracts.id, {
      onDelete: "set null",
    }),
    escalatedAt: time("escalated_at"),
    escalatedTo: userRef("escalated_to"),
    escalationReason: text("escalation_reason"),
    priority: priority("priority").default("medium").notNull(),
    autoRenewal: boolean("auto_renewal").default(false).notNull(),
    ...timestamps(),
  },
  (t) => [
    index("renewals_requester_idx").on(t.requestedBy),
    index("renewals_status_idx").on(t.status),
    uniqueIndex("renewals_pending_unique")
      .on(t.originalContractId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
export const contractCancellations = pgTable(
  "contract_cancellations",
  {
    id: id(),
    contractId: contractRef(),
    cancelledBy: userRef("cancelled_by"),
    cancelledAt: time("cancelled_at").defaultNow().notNull(),
    reason: cancellationReason("reason").notNull(),
    description: text("description"),
    approvedBy: userRef("approved_by"),
    approvedAt: time("approved_at"),
    status: approvalStatus("status").default("pending").notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("cancellations_contract_idx").on(t.contractId),
    index("cancellations_status_idx").on(t.status),
  ],
);
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    data: jsonb("data").default({}).notNull(),
    expiryContractId: uuid("expiry_contract_id").references(() => contracts.id, {
      onDelete: "cascade",
    }),
    expiryThreshold: integer("expiry_threshold"),
    readAt: time("read_at"),
    priority: priority("priority").default("medium").notNull(),
    expiresAt: time("expires_at"),
    actionUrl: text("action_url"),
    actionLabel: text("action_label"),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("notifications_expiry_unique").on(t.expiryContractId, t.userId, t.expiryThreshold),
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    check(
      "notifications_type_check",
      sql`${t.type} IN ('contract_expiring','renewal_request','approval_needed','contract_signed','contract_cancelled','renewal_approved','renewal_rejected','approval_result','signature_required')`,
    ),
  ],
);
export const files = pgTable(
  "files",
  {
    id: id(),
    ownerId: uuid("owner_id").references(() => users.id, {
      onDelete: "set null",
    }),
    contractId: uuid("contract_id").references(() => contracts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    path: text("path").notNull().unique(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("files_owner_idx").on(t.ownerId),
    check("files_kind_check", sql`${t.kind} IN ('avatar','signature','export')`),
    check("files_size_positive", sql`${t.size} >= 0`),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    name: text("name").notNull(),
    startedAt: time("started_at").defaultNow().notNull(),
    finishedAt: time("finished_at"),
    ok: boolean("ok"),
    summary: jsonb("summary"),
    error: text("error"),
  },
  (table) => [index("job_runs_name_started_idx").on(table.name, table.startedAt)],
);

export const storageMigrationObjects = pgTable(
  "storage_migration_objects",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobRuns.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    copied: boolean("copied").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.jobId, table.key] }),
    check("storage_migration_objects_size_check", sql`${table.size} >= 0`),
    check("storage_migration_objects_sha256_check", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const storageMigrationFailures = pgTable(
  "storage_migration_failures",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobRuns.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.key] })],
);

export const expiryDeliveries = pgTable(
  "expiry_deliveries",
  {
    id: id(),
    contractId: contractRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threshold: integer("threshold").notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("expiry_deliveries_unique").on(table.contractId, table.userId, table.threshold),
  ],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    template: text("template")
      .$type<import("../lib/mail/templates/index.js").MailTemplate>()
      .notNull(),
    payload: jsonb("payload")
      .$type<import("../lib/mail/templates/index.js").MailPayload>()
      .notNull(),
    encryptedPayload: text("encrypted_payload"),
    expiresAt: time("expires_at"),
    status: text("status").$type<"pending" | "sent" | "failed">().default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: time("next_attempt_at").defaultNow().notNull(),
    lastError: text("last_error"),
    providerId: text("provider_id"),
    createdAt: time("created_at").defaultNow().notNull(),
    sentAt: time("sent_at"),
  },
  (table) => [
    index("email_outbox_due_idx").on(table.status, table.nextAttemptAt),
    check("email_outbox_status_check", sql`${table.status} in ('pending','sent','failed')`),
    check("email_outbox_attempts_check", sql`${table.attempts} between 0 and 6`),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: id(),
    at: time("at")
      .default(sql`clock_timestamp()`)
      .notNull(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name").notNull(),
    area: text("area")
      .$type<"users" | "settings" | "templates" | "variables" | "storage" | "auth">()
      .notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetLabel: text("target_label").notNull(),
    details: jsonb("details").default({}).notNull(),
    ip: text("ip"),
    sequence: integer("sequence").default(0).notNull().unique("admin_audit_logs_sequence_key"),
    entryHash: text("entry_hash").default("").notNull(),
    previousHash: text("previous_hash"),
  },
  (table) => [
    check(
      "admin_audit_logs_area_check",
      sql`${table.area} IN ('users','settings','templates','variables','storage','auth')`,
    ),
    index("admin_audit_at_idx").on(table.at, table.id),
    index("admin_audit_actor_idx").on(table.actorId, table.at),
    index("admin_audit_area_action_idx").on(table.area, table.action, table.at),
  ],
);
export const adminAuditHead = pgTable(
  "admin_audit_head",
  {
    id: integer("id").primaryKey(),
    sequence: integer("sequence").default(0).notNull(),
    entryHash: text("entry_hash"),
  },
  (table) => [check("admin_audit_head_id_check", sql`${table.id} = 1`)],
);

export const authRequestBudgets = pgTable(
  "auth_request_budgets",
  {
    key: text("key").primaryKey(),
    attempts: integer("attempts").notNull(),
    expiresAt: time("expires_at").notNull(),
  },
  (table) => [index("auth_request_budgets_expiry_idx").on(table.expiresAt)],
);

/** Marked copies handed out by the system (status stamp or verification copy), recognised by hash. */
export const issuedCopies = pgTable(
  "issued_copies",
  {
    sha256: text("sha256").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"status" | "verification">().notNull(),
    stamp: text("stamp"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    issuedBy: uuid("issued_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("issued_copies_contract_idx").on(table.contractId)],
);
export const verificationCodes = pgTable(
  "verification_codes",
  {
    code: text("code").primaryKey(),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    legacy: boolean("legacy").default(false).notNull(),
    revoked: boolean("revoked").default(false).notNull(),
  },
  (table) => [index("verification_codes_contract_idx").on(table.contractId)],
);
