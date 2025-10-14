/*
  # Final fix for infinite recursion in contract_signatories

  1. Security
    - Drop ALL existing policies to eliminate recursion
    - Create only minimal, direct policies without circular references
    - No table joins or complex subqueries
    - Direct auth.uid() comparisons only

  2. Access Rules
    - Users can see their own signatory records by user_id
    - Users can see signatory records matching their email  
    - Service role has full access
    - No policy references to other tables to avoid recursion
*/

-- Drop ALL existing policies on contract_signatories to eliminate recursion
DROP POLICY IF EXISTS "creator_can_see_signatories" ON contract_signatories;
DROP POLICY IF EXISTS "service_role_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_email_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_own_user_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_user_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_email_match" ON contract_signatories;
DROP POLICY IF EXISTS "contract_owner_signatories" ON contract_signatories;

-- Create minimal policies without any table references to avoid recursion
CREATE POLICY "signatories_by_user_id" ON contract_signatories
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "signatories_by_email" ON contract_signatories  
  FOR SELECT TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "signatories_service_role" ON contract_signatories
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);