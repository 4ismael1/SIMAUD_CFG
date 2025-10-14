/*
  # Fix policy conflicts - Give supervisors full admin permissions

  1. Security Changes
    - Drop existing policies to avoid conflicts
    - Create new policies giving supervisors full access like admins
    - Ensure supervisors can read/update all contracts and approvals
  
  2. Missing Data Fix
    - Create approval records for existing pending contracts
    - Ensure all data is properly linked
*/

-- First, drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "supervisors_read_all_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_update_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_and_admins_read_all_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_and_admins_update_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "contracts_supervisors_read" ON contracts;
DROP POLICY IF EXISTS "contracts_supervisors_update" ON contracts;

-- Contract Approvals - Supervisors have admin-like access
CREATE POLICY "supervisors_admin_access_approvals"
  ON contract_approvals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Contracts - Supervisors have admin-like access
CREATE POLICY "supervisors_admin_access_contracts"
  ON contracts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Contract Signatories - Supervisors have admin-like access
CREATE POLICY "supervisors_admin_access_signatories"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Contract Templates - Supervisors have admin-like access
CREATE POLICY "supervisors_admin_access_templates"
  ON contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Create missing approval records for pending contracts
INSERT INTO contract_approvals (
  contract_id,
  version_number,
  requested_by,
  requested_at,
  status
)
SELECT 
  c.id,
  c.current_version,
  c.created_by,
  c.updated_at,
  'pending'::text
FROM contracts c
WHERE c.approval_status = 'pending_approval'
AND NOT EXISTS (
  SELECT 1 FROM contract_approvals ca 
  WHERE ca.contract_id = c.id 
  AND ca.status = 'pending'
);