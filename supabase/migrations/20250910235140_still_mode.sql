/*
  # Fix infinite recursion in contract_signatories policies

  1. Security Changes
    - Remove all policies that cause recursion loops
    - Add simple, direct policies without subqueries
    - Ensure signatory access without complex lookups

  2. Policy Changes
    - Simple user_id based access for registered users
    - Direct email comparison for unregistered signatories
    - Service role access for system operations
    - No cross-table references that could cause loops
*/

-- Remove ALL existing policies that could cause recursion
DROP POLICY IF EXISTS "signatories_contract_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_own_records" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_access" ON contract_signatories;

-- Add simple, non-recursive policies
-- Policy 1: Allow users to see their own signatory records by user_id
CREATE POLICY "signatories_by_user_id"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 2: Allow users to see signatory records by their email (for unregistered signatories)
CREATE POLICY "signatories_by_email"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Policy 3: Service role access (no recursion risk)
CREATE POLICY "signatories_service_role"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);