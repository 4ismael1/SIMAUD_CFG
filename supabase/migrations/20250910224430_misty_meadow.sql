/*
  # Fix contract_signatories RLS policies - Super Simple Version

  1. Remove ALL existing policies
  2. Create extremely simple policies that only use auth.uid()
  3. No complex queries, no table joins, no custom functions
  4. Direct comparisons only

  This should eliminate all permission errors and recursion issues.
*/

-- Step 1: Remove ALL existing policies to start fresh
DROP POLICY IF EXISTS "Users can read own signatories by email" ON contract_signatories;
DROP POLICY IF EXISTS "Users can read own signatories by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Users can update own signatories by email" ON contract_signatories;
DROP POLICY IF EXISTS "Users can update own signatories by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Service role full access" ON contract_signatories;
DROP POLICY IF EXISTS "Allow signatories to read by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Allow signatories to read by email" ON contract_signatories;
DROP POLICY IF EXISTS "Allow signatories to update by user_id" ON contract_signatories;
DROP POLICY IF EXISTS "Allow signatories to update by email" ON contract_signatories;
DROP POLICY IF EXISTS "Allow service role full access" ON contract_signatories;

-- Step 2: Create the simplest possible policies

-- Policy 1: Users can read their own signatory records (by user_id)
CREATE POLICY "read_own_signatories_by_user_id" ON contract_signatories
  FOR SELECT 
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Users can update their own signatory records (by user_id) 
CREATE POLICY "update_own_signatories_by_user_id" ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy 3: Service role has full access
CREATE POLICY "service_role_all_access" ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Step 3: Grant basic table permissions
GRANT SELECT, UPDATE ON contract_signatories TO authenticated;
GRANT ALL ON contract_signatories TO service_role;