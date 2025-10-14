/*
  # Give supervisors admin-like permissions
  
  1. Permissions
    - Supervisors get same access as admins for all contract-related tables
    - Full read/write access to contracts, approvals, signatories, etc.
    - No restrictions, complete access to all data
  
  2. Security
    - Supervisors treated like admins in the system
    - Can see and modify all contracts and approvals
*/

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "contract_approvals_read" ON contract_approvals;
DROP POLICY IF EXISTS "contract_approvals_update" ON contract_approvals;
DROP POLICY IF EXISTS "contract_approvals_insert" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_service_full_access" ON contract_approvals;
DROP POLICY IF EXISTS "gestors_read_own_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_and_admins_read_all_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_and_admins_update_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_read_all_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "supervisors_update_approvals" ON contract_approvals;
DROP POLICY IF EXISTS "users_create_approval_requests" ON contract_approvals;
DROP POLICY IF EXISTS "users_read_own_approvals" ON contract_approvals;

DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatory_read" ON contracts;
DROP POLICY IF EXISTS "contracts_supervisors_read" ON contracts;
DROP POLICY IF EXISTS "contracts_supervisors_update" ON contracts;

DROP POLICY IF EXISTS "signatories_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;

-- CONTRACT APPROVALS - SUPERVISORS = ADMINS
CREATE POLICY "approvals_admin_supervisor_full_access" 
ON contract_approvals FOR ALL 
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

CREATE POLICY "approvals_users_own" 
ON contract_approvals FOR SELECT 
TO authenticated 
USING (requested_by = auth.uid());

CREATE POLICY "approvals_users_insert" 
ON contract_approvals FOR INSERT 
TO authenticated 
WITH CHECK (requested_by = auth.uid());

CREATE POLICY "approvals_service_role" 
ON contract_approvals FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- CONTRACTS - SUPERVISORS = ADMINS
CREATE POLICY "contracts_admin_supervisor_full_access" 
ON contracts FOR ALL 
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

CREATE POLICY "contracts_owner_access" 
ON contracts FOR ALL 
TO authenticated 
USING (created_by = auth.uid()) 
WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_signatory_read" 
ON contracts FOR SELECT 
TO authenticated 
USING (
  id IN (
    SELECT contract_id FROM contract_signatories 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "contracts_service_role" 
ON contracts FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- CONTRACT SIGNATORIES - SUPERVISORS = ADMINS  
CREATE POLICY "signatories_admin_supervisor_full_access" 
ON contract_signatories FOR ALL 
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

CREATE POLICY "signatories_by_user_id" 
ON contract_signatories FOR ALL 
TO authenticated 
USING (user_id = auth.uid()) 
WITH CHECK (user_id = auth.uid());

CREATE POLICY "signatories_by_email" 
ON contract_signatories FOR ALL 
TO authenticated 
USING (email = auth.email());

CREATE POLICY "signatories_service_role" 
ON contract_signatories FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Ensure we have approval records for existing pending contracts
INSERT INTO contract_approvals (contract_id, version_number, requested_by, status)
SELECT 
  c.id as contract_id,
  COALESCE(c.current_version, 1) as version_number,
  c.created_by as requested_by,
  'pending' as status
FROM contracts c
WHERE c.approval_status = 'pending_approval'
AND NOT EXISTS (
  SELECT 1 FROM contract_approvals ca 
  WHERE ca.contract_id = c.id 
  AND ca.status = 'pending'
);