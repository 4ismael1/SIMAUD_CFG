/*
  # Fix supervisor approvals visibility

  1. Security
    - Drop and recreate contract_approvals policies
    - Ensure supervisors can see all pending approvals
    - Maintain security for other operations

  2. Changes
    - Simple policies without complex joins
    - Direct role checks using auth.uid()
    - Clear permissions for supervisors and admins
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Admin and supervisors can manage all approvals" ON contract_approvals;
DROP POLICY IF EXISTS "Gestores can create approval requests" ON contract_approvals;
DROP POLICY IF EXISTS "Gestores can view own approval requests" ON contract_approvals;
DROP POLICY IF EXISTS "Supervisors can update approval records" ON contract_approvals;
DROP POLICY IF EXISTS "Users can create approval requests for own contracts" ON contract_approvals;
DROP POLICY IF EXISTS "Users can view approvals of own contracts" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_admin_manage" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_owner_access" ON contract_approvals;
DROP POLICY IF EXISTS "approvals_service_role" ON contract_approvals;

-- Create simple and clear policies
-- 1. Supervisors and admins can see all approvals
CREATE POLICY "supervisors_read_all_approvals"
ON contract_approvals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
);

-- 2. Supervisors and admins can update approvals (approve/reject)
CREATE POLICY "supervisors_update_approvals"
ON contract_approvals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'supervisor')
  )
);

-- 3. Users can create approval requests for their own contracts
CREATE POLICY "users_create_approval_requests"
ON contract_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  requested_by = auth.uid()
);

-- 4. Users can view their own approval requests
CREATE POLICY "users_read_own_approvals"
ON contract_approvals
FOR SELECT
TO authenticated
USING (
  requested_by = auth.uid()
);

-- 5. Service role full access
CREATE POLICY "approvals_service_full_access"
ON contract_approvals
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);