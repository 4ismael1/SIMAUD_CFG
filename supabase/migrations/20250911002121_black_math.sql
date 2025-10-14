/*
  # Ultra Simple Permissions Fix
  
  1. Security Changes
    - Drop all problematic policies
    - Create simple policies using only auth.uid()
    - Give admin/supervisor/gestor full access to everything
    - Avoid complex conditions that might fail
  
  2. Data Population
    - Create missing approval records for pending contracts
    - Ensure data is visible in dashboard
*/

-- Drop all existing policies that might be causing issues
DROP POLICY IF EXISTS "contracts_admin_supervisor_full_access" ON contracts;
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatory_read" ON contracts;
DROP POLICY IF EXISTS "contracts_service_role" ON contracts;
DROP POLICY IF EXISTS "supervisors_admin_access_contracts" ON contracts;

DROP POLICY IF EXISTS "approvals_admin_supervisor_full_access" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_users_own" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_users_insert" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_service_role" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_admin_access_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_read_all_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_manage_all_approvals" ON contract_approvals;

DROP POLICY IF EXISTS "signatories_admin_supervisor_full_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;
DROP POLICY IF EXISTS "supervisors_admin_access_signatories" ON contract_signatories;

-- Create ultra simple policies for contracts
CREATE POLICY "contracts_read_all"
  ON contracts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "contracts_admin_full"
  ON contracts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "contracts_owner_manage"
  ON contracts FOR ALL
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "contracts_service"
  ON contracts FOR ALL
  TO service_role
  USING (true);

-- Create ultra simple policies for approvals
CREATE POLICY "approvals_read_all"
  ON contract_approvals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "approvals_admin_full"
  ON contract_approvals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "approvals_owner_manage"
  ON contract_approvals FOR ALL
  TO authenticated
  USING (requested_by = auth.uid());

CREATE POLICY "approvals_service"
  ON contract_approvals FOR ALL
  TO service_role
  USING (true);

-- Create ultra simple policies for signatories
CREATE POLICY "signatories_read_all"
  ON contract_signatories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "signatories_admin_full"
  ON contract_signatories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "signatories_user_access"
  ON contract_signatories FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR email = auth.email());

CREATE POLICY "signatories_service"
  ON contract_signatories FOR ALL
  TO service_role
  USING (true);

-- Create missing approval records for pending contracts
INSERT INTO contract_approvals (
  contract_id,
  version_number,
  requested_by,
  requested_at,
  status,
  comments
)
SELECT 
  c.id,
  c.current_version,
  c.created_by,
  c.updated_at,
  'pending',
  'Auto-generated approval request'
FROM contracts c
WHERE c.approval_status = 'pending_approval'
  AND NOT EXISTS (
    SELECT 1 FROM contract_approvals ca 
    WHERE ca.contract_id = c.id 
    AND ca.version_number = c.current_version
    AND ca.status = 'pending'
  );