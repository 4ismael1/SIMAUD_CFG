/*
  # Fix permission denied for users table in RLS policies

  1. Problem
    - RLS policies trying to access auth.users table directly
    - PostgreSQL doesn't allow direct access to auth.users from RLS policies
    - Need to use auth.email() function instead

  2. Solution
    - Drop problematic policies that reference auth.users
    - Create new policies using only auth.uid() and auth.email()
    - Use simple, direct comparisons without subqueries

  3. Security
    - Users can read their own signatory records by user_id or email
    - Users can update their own signatory status
    - Service role has full access for system operations
*/

-- Drop all existing policies for contract_signatories
DROP POLICY IF EXISTS "signatory_read_own_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_read_own_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_update_own_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatory_update_own_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "service_role_all_access" ON contract_signatories;

-- Create simple policies that don't reference auth.users table
CREATE POLICY "Users can read own signatories by user_id"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can read own signatories by email"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = auth.email()::text);

CREATE POLICY "Users can update own signatories by user_id"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own signatories by email"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (email = auth.email()::text)
  WITH CHECK (email = auth.email()::text);

-- Service role access for system operations
CREATE POLICY "Service role full access"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);