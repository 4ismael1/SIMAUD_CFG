export type Role = "admin" | "supervisor" | "gestor" | "user";
export type ContractStatus =
  | "draft"
  | "pending_approval"
  | "rejected"
  | "pending_signatures"
  | "active"
  | "expiring_soon"
  | "expired"
  | "cancelled"
  | "renewed"
  /** T17: replaced by an amendment that is now in force. */
  | "amended";
export type ApprovalStatus = "pending" | "approved" | "rejected";
export type SignatoryRole = "client" | "witness" | "contractor";
export type SignatoryStatus = "pending" | "signed" | "declined";
export type VariableType = "text" | "date" | "number" | "select" | "textarea";
export type TemplateStatus = "active" | "inactive";
export type CancellationReason =
  | "breach"
  | "mutual_agreement"
  | "client_request"
  | "payment_default"
  | "other";
export type VariableValues = Record<string, string | number | null>;
export interface PageQuery {
  page?: number;
  pageSize?: number;
}
export interface ListQuery extends PageQuery {
  q?: string;
  sort?: string;
}
export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}
export interface MessageResponse {
  message: string;
}
export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  cedula: string | null;
  /** T19: job title («Directora administrativa»); fills {party}_cargo in contracts. */
  position?: string | null;
  role: Role;
  avatarPath: string | null;
  emailConfirmedAt: string | null;
  isActive: boolean;
  deletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** True for accounts created with a temporary password (first admin); every other action is blocked until changed. */
  mustChangePassword?: boolean;
  /** T12b: "invited" = invitation sent and not accepted yet. Absent on older APIs. */
  status?: UserStatus;
  invitedAt?: string | null;
}
export interface ProfileInput {
  /** T19: job title, 0–120 characters; null clears it. */
  position?: string | null;
  name: string;
  phone: string;
  cedula: string;
}
export interface LoginInput {
  email: string;
  password: string;
}
export interface RegisterInput extends ProfileInput, LoginInput {}
export interface LoginResponse {
  accessToken: string;
  user: User;
}
export interface UserResponse {
  user: User;
}
/** Registration is opaque (always 202): it never reveals whether an e-mail or cédula already exists. */
export type RegisterResponse = MessageResponse;
export interface PasswordInput {
  currentPassword: string;
  newPassword: string;
}
export interface EmailInput {
  newEmail: string;
  password: string;
}
export interface ResetPasswordInput {
  token: string;
  password: string;
}
/** The admin never chooses a password: the API sends an invitation link (T12b). */
export interface UserInput extends ProfileInput {
  email: string;
  role: Role;
}
export type UserPatch = Partial<UserInput> & {
  isActive?: boolean;
};
export type UserStatus = "active" | "inactive" | "invited";
export interface UserQuery extends ListQuery {
  role?: Role;
  status?: UserStatus;
}
export type UserLookup = Pick<
  User,
  "id" | "name" | "email" | "phone" | "cedula" | "position"
>;
