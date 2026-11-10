import type { ContentFormat, DocumentContent, RichDoc } from "../rich-doc/types";
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
  /** Absent = plain. */
  contentFormat?: ContentFormat;
  content: DocumentContent;
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
  contentFormat?: ContentFormat;
  content: DocumentContent;
  values: VariableValues;
}
/** Plain: `html` (escaped text). rich-v1: `document`. Older APIs omit contentFormat. */
export type PreviewResponse =
  | { contentFormat?: "plain"; html: string; missing: string[] }
  | { contentFormat: "rich-v1"; document: RichDoc; missing: string[] };
