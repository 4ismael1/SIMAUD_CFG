/*
  # Fix infinite recursion in contract_signatories RLS policies
  
  1. Complete reset of all RLS policies
  2. Simple, non-recursive policies
  3. Direct comparisons only - no complex subqueries
  4. Avoid any potential circular references
*/

-- Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS "Admins can manage all signatory records" ON contract_signatories;
DROP POLICY IF EXISTS "Admins can read all signatory records" ON contract_signatories;
DROP POLICY IF EXISTS "Contract creators can manage signatories" ON contract_signatories;
DROP POLICY IF EXISTS "Users can read own signatory records by email" ON contract_signatories;
DROP POLICY IF EXISTS "Users can read own signatory records by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Users can update own signatory records by email" ON contract_signatories;
DROP POLICY IF EXISTS "Users can update own signatory records by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can read own records" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can update own records" ON contract_signatories;
DROP POLICY IF EXISTS "Contract creators can manage their signatories" ON contract_signatories;
DROP POLICY IF EXISTS "Admins can manage signatories" ON contract_signatories;

-- Ensure RLS is enabled
ALTER TABLE contract_signatories ENABLE ROW LEVEL SECURITY;

-- Create simple, non-recursive policies
-- Policy 1: Users can see records where they are the signatory (by user_id)
CREATE POLICY "signatory_read_own_by_user_id" ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Users can see records where their email matches (for unlinked signatories)  
CREATE POLICY "signatory_read_own_by_email" ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Policy 3: Users can update their own signatory status (by user_id)
CREATE POLICY "signatory_update_own_by_user_id" ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 4: Users can update their own signatory status (by email)
CREATE POLICY "signatory_update_own_by_email" ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Policy 5: Service role can do everything (for system operations)
CREATE POLICY "service_role_all_access" ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);