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
  | "renewed";
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
  role: Role;
  avatarPath: string | null;
  emailConfirmedAt: string | null;
  isActive: boolean;
  deletedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ProfileInput {
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
export interface RegisterResponse extends UserResponse, MessageResponse {}
export interface AvailabilityQuery {
  email?: string;
  cedula?: string;
}
export interface AvailabilityResponse {
  emailAvailable?: boolean;
  cedulaAvailable?: boolean;
}
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
export interface UserInput extends ProfileInput {
  email: string;
  role: Role;
  password?: string;
}
export type UserPatch = Partial<Omit<UserInput, "password">> & {
  isActive?: boolean;
};
export interface UserQuery extends ListQuery {
  role?: Role;
}
export type UserLookup = Pick<
  User,
  "id" | "name" | "email" | "phone" | "cedula"
>;
