/*
  # Fix infinite recursion in contract_signatories policies

  1. Problem
    - Multiple overlapping policies causing infinite recursion
    - Complex policy conditions creating loops
    - Recent migration caused policy conflicts

  2. Solution
    - Drop ALL existing policies to start clean
    - Create simple, non-recursive policies
    - Each policy serves a specific purpose without overlap
    - No subqueries that could cause recursion

  3. Policies Created
    - Signatories access their own records by user_id
    - Signatories access their records by email (for unregistered users)  
    - Contract creators can see signatories of their contracts
    - Service role has full access
*/

-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "signatories_own_records" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_email_access" ON contract_signatories;
DROP POLICY IF EXISTS "Contract creators can see their contract signatories" ON contract_signatories;
DROP POLICY IF EXISTS "Contract creators can see signatories of their contracts" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_access" ON contract_signatories;

-- Policy 1: Signatories can access their own records by user_id (registered users)
CREATE POLICY "signatory_own_user_access"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Signatories can access records by email (for users not yet registered)  
CREATE POLICY "signatory_email_access"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Policy 3: Contract creators can see signatories of their contracts
CREATE POLICY "creator_can_see_signatories" 
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    contract_id IN (
      SELECT id FROM contracts WHERE created_by = auth.uid()
    )
  );

-- Policy 4: Service role has full access
CREATE POLICY "service_role_access"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);