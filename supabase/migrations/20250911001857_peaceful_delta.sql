/*
  # Fix uid() function error in RLS policies
  
  1. Corrections
    - Replace uid() with auth.uid() in all policies
    - Ensure proper Supabase auth function usage
    - Give gestores full admin permissions
  
  2. Security
    - Maintain proper RLS with correct auth function
    - Grant admin-level access to gestores
    - Full CRUD permissions for contract management
*/

-- Drop existing policies that might have uid() function
DROP POLICY IF EXISTS "gestores_full_contracts" ON contracts;
DROP POLICY IF EXISTS "gestores_full_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "gestores_full_signatories" ON contract_signatories;
DROP POLICY IF EXISTS "gestores_full_versions" ON contract_versions;
DROP POLICY IF EXISTS "gestores_full_audit" ON contract_audit_logs;
DROP POLICY IF EXISTS "gestores_full_templates" ON contract_templates;
DROP POLICY IF EXISTS "gestores_full_variables" ON template_variables;

-- GESTORES: Full admin-level permissions using auth.uid()
CREATE POLICY "gestores_admin_contracts"
  ON contracts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_approvals"
  ON contract_approvals
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_signatories"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_versions"
  ON contract_versions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_audit"
  ON contract_audit_logs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_templates"
  ON contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

CREATE POLICY "gestores_admin_variables"
  ON template_variables
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor', 'gestor')
    )
  );

-- Create approval requests for existing pending contracts
INSERT INTO contract_approvals (contract_id, version_number, requested_by, status, comments)
SELECT 
  id,
  current_version,
  created_by,
  'pending',
  'Auto-generated approval request for existing pending contract'
FROM contracts 
WHERE approval_status = 'pending_approval'
AND id NOT IN (
  SELECT DISTINCT contract_id 
  FROM contract_approvals 
  WHERE status = 'pending'
)
AND created_by IS NOT NULL;