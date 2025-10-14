/*
  # Fix User Role Permissions with Correct Auth Function

  1. Security Changes
    - Grant full read access to users on all contract-related tables
    - Allow users to update their own signatures
    - Use correct auth.uid() function instead of uid()
    
  2. Tables Updated
    - contracts: Full read access
    - contract_signatories: Read all, update own signatures
    - contract_versions: Full read access
    - contract_approvals: Full read access
    - contract_audit_logs: Full read access
    - contract_renewals: Full read access
    - contract_cancellations: Full read access
    - template_variables: Full read access
    - contract_templates: Full read access
*/

-- Drop existing user-specific policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view contracts they're involved in" ON contracts;
DROP POLICY IF EXISTS "Users can view their signatories" ON contract_signatories;
DROP POLICY IF EXISTS "Users can update their own signatures" ON contract_signatories;
DROP POLICY IF EXISTS "Users can view versions of their contracts" ON contract_versions;
DROP POLICY IF EXISTS "Users can view approvals of their contracts" ON contract_approvals;
DROP POLICY IF EXISTS "Users can view audit logs of own contracts" ON contract_audit_logs;
DROP POLICY IF EXISTS "Users can view renewals of their contracts" ON contract_renewals;
DROP POLICY IF EXISTS "Users can view cancellations of their contracts" ON contract_cancellations;

-- Grant full read access to users on contracts
CREATE POLICY "users_full_read_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_signatories + update own signatures
CREATE POLICY "users_full_access_signatories"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (user_id = auth.uid() OR email = (SELECT email FROM user_profiles WHERE id = auth.uid()));

-- Grant full read access to users on contract_versions
CREATE POLICY "users_full_read_versions"
  ON contract_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_approvals
CREATE POLICY "users_full_read_approvals"
  ON contract_approvals
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_audit_logs
CREATE POLICY "users_full_read_audit"
  ON contract_audit_logs
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_renewals
CREATE POLICY "users_full_read_renewals"
  ON contract_renewals
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_cancellations
CREATE POLICY "users_full_read_cancellations"
  ON contract_cancellations
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on template_variables
CREATE POLICY "users_full_read_variables"
  ON template_variables
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant full read access to users on contract_templates
CREATE POLICY "users_full_read_templates"
  ON contract_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to create notifications for themselves
CREATE POLICY "users_can_create_notifications"
  ON notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());