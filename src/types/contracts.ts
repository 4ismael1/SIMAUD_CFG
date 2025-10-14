export interface Contract {
  id: string;
  template_id: string | null;
  title: string;
  content: string;
  variables_data: Record<string, any>;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  approval_status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'signed' | 'completed';
  actual_status: 'draft' | 'active' | 'expiring_soon' | 'expired' | 'completed' | 'cancelled' | 'renewed';
  current_version: number;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  generated_content: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  auto_renewal: boolean;
  parent_contract_id: string | null;
  renewal_type: 'original' | 'manual_renewal' | 'auto_renewal' | null;
  archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
}

export interface ContractSignatory {
  id: string;
  contract_id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'client' | 'witness' | 'contractor';
  signing_order: number;
  signed_at: string | null;
  signature_url: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractVersion {
  id: string;
  contract_id: string;
  version_number: number;
  content: string;
  variables_data: Record<string, any>;
  created_by: string | null;
  created_at: string;
  change_summary: string | null;
}

export interface ContractApproval {
  id: string;
  contract_id: string;
  version_number: number;
  requested_by: string | null;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
  comments: string | null;
  created_at: string;
}

export interface ContractAuditLog {
  id: string;
  contract_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  user_id: string | null;
  user_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

export interface ContractTemplate {
  id: string;
  title: string;
  content: string;
  description: string;
  category: string;
  variables: string[];
  status: 'active' | 'inactive';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options: string[] | null;
  required: boolean;
  description: string;
}

export interface ContractFormData {
  template_id: string;
  title: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  contract_value: number | null;
  start_date: string | null;
  end_date: string | null;
  notes: string;
  variables_data: Record<string, any>;
  signatories: Omit<ContractSignatory, 'id' | 'contract_id' | 'created_at' | 'updated_at' | 'signed_at' | 'signature_url' | 'ip_address' | 'user_agent'>[];
  auto_renewal: boolean;
}

export interface ContractRenewal {
  id: string;
  original_contract_id: string;
  requested_by: string | null;
  requested_at: string;
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'cancelled';
  proposed_changes: Record<string, any>;
  proposed_start_date: string;
  proposed_end_date: string;
  proposed_value: number;
  gestor_response: string | null;
  processed_by: string | null;
  processed_at: string | null;
  new_contract_id: string | null;
  escalated_at: string | null;
  escalated_to: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  auto_renewal: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractCancellation {
  id: string;
  contract_id: string;
  cancelled_by: string | null;
  cancelled_at: string;
  reason: 'breach' | 'mutual_agreement' | 'client_request' | 'payment_default' | 'other';
  description: string | null;
  approved_by: string | null;
  approved_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'contract_expiring' | 'renewal_request' | 'approval_needed' | 'contract_signed' | 'contract_cancelled' | 'renewal_approved' | 'renewal_rejected';
  title: string;
  message: string;
  data: Record<string, any>;
  read_at: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  expires_at: string | null;
  action_url: string | null;
  action_label: string | null;
  created_at: string;
}