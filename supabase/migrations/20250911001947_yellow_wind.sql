/*
# Fix Gestor and Supervisor Permissions

1. Security Updates
   - Give gestores and supervisors admin-level access
   - Remove restrictive RLS policies
   - Enable full system access

2. Data Population  
   - Create missing approval records
   - Ensure dashboard data is available
*/

-- First, disable RLS temporarily to clean up
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatories DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_audit_logs DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies to start fresh
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

DROP POLICY IF EXISTS "signatories_admin_supervisor_full_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;
DROP POLICY IF EXISTS "supervisors_admin_access_signatories" ON contract_signatories;

-- Re-enable RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create simple, permissive policies for admin/supervisor/gestor roles
CREATE POLICY "full_access_admin_roles" ON contracts
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR created_by = auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR created_by = auth.uid()
    );

CREATE POLICY "full_access_admin_approvals" ON contract_approvals
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR requested_by = auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR requested_by = auth.uid()
    );

CREATE POLICY "full_access_admin_signatories" ON contract_signatories
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR user_id = auth.uid()
        OR email = auth.email()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE user_profiles.id = auth.uid() 
            AND user_profiles.role IN ('admin', 'supervisor', 'gestor')
        )
        OR user_id = auth.uid()
    );

-- Service role policies
CREATE POLICY "service_role_contracts" ON contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_approvals" ON contract_approvals FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_signatories" ON contract_signatories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Create missing approval records for pending contracts
INSERT INTO contract_approvals (contract_id, version_number, requested_by, status, comments)
SELECT 
    c.id,
    c.current_version,
    c.created_by,
    'pending',
    'Auto-generated approval request'
FROM contracts c
WHERE c.approval_status = 'pending_approval'
AND NOT EXISTS (
    SELECT 1 FROM contract_approvals ca 
    WHERE ca.contract_id = c.id 
    AND ca.status = 'pending'
);