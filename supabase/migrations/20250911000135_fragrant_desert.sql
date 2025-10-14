/*
  # Fix permission denied for table users error

  1. Problem
    - Policies are trying to access auth.users table which requires special permissions
    - RLS policies cannot directly query auth.users table
    - Must use auth.uid() and auth.email() functions instead

  2. Solution
    - Drop all existing policies that reference users table
    - Create simple policies using only auth functions
    - No table joins or subqueries to auth.users
*/

-- Drop all existing policies on contract_signatories
DROP POLICY IF EXISTS "signatories_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_owner_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_email_access" ON contract_signatories;
DROP POLICY IF EXISTS "Allow users to read their signatory records" ON contract_signatories;

-- Create simple policies without referencing auth.users table
CREATE POLICY "signatories_by_user_id" 
  ON contract_signatories 
  FOR ALL 
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "signatories_by_email" 
  ON contract_signatories 
  FOR ALL 
  TO authenticated
  USING (email = auth.email());

CREATE POLICY "signatories_service_role" 
  ON contract_signatories 
  FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);