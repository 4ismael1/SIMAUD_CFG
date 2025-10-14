/*
  # Fix infinite recursion in contracts RLS policies

  1. Security
    - Remove all existing policies that cause recursion
    - Create simple, direct policies without loops
    - Ensure proper access control without complexity

  2. New Policies
    - contracts_owner_access: Users see their own contracts
    - contracts_admin_access: Admins/supervisors see all contracts
    - contracts_signatory_access: Signatories see contracts they're assigned to
    - contracts_service_access: Service role has full access

  3. Changes
    - Remove recursive policy references
    - Direct auth.uid() comparisons only
    - Clean subqueries without recursion
*/

-- Drop all existing policies to start clean
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatory_read" ON contracts;
DROP POLICY IF EXISTS "contracts_admin_manage" ON contracts;
DROP POLICY IF EXISTS "contracts_read_all" ON contracts;

-- Create simple, clean policies without recursion

-- 1. Users can access contracts they created
CREATE POLICY "contracts_owner_access" ON contracts
FOR ALL
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- 2. Admin and supervisor can access all contracts
CREATE POLICY "contracts_admin_access" ON contracts
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

-- 3. Signatories can read contracts where they are assigned
CREATE POLICY "contracts_signatory_access" ON contracts
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT contract_signatories.contract_id 
    FROM contract_signatories 
    WHERE contract_signatories.user_id = auth.uid()
    OR contract_signatories.email = auth.email()
  )
);

-- 4. Service role has full access
CREATE POLICY "contracts_service_access" ON contracts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);