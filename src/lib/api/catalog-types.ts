import type {
  ListQuery,
  VariableType,
  TemplateStatus,
  VariableValues,
} from "./core-types";
export interface VariableInput {
  name: string;
  label: string;
  type: VariableType;
  required?: boolean;
  options?: string[] | null;
  description?: string | null;
}
export interface Variable extends VariableInput {
  id: string;
  required: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface TemplateInput {
  title: string;
  content: string;
  description?: string | null;
  category?: string;
  status?: TemplateStatus;
}
export interface Template extends TemplateInput {
  id: string;
  category: string;
  status: TemplateStatus;
  variables: string[];
  usageCount?: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface TemplateDetail extends Template {
  resolvedVariables: Variable[];
}
export interface TemplateQuery extends ListQuery {
  status?: TemplateStatus;
  category?: string;
}
export interface PreviewInput {
  content: string;
  values: VariableValues;
}
export interface PreviewResponse {
  html: string;
  missing: string[];
}
