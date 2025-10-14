/*
  # Fix infinite recursion in contract_signatories RLS policies

  1. Problem
    - Infinite recursion detected in policy for relation "contract_signatories"
    - Caused by policies that reference the same table they're protecting

  2. Solution
    - Drop all existing problematic policies
    - Create simple, non-recursive policies
    - Use direct comparisons with auth.uid() and auth.email()

  3. Security
    - Users can only see their own signatory records
    - Admin/supervisors can see all records
    - No complex subqueries that cause recursion
*/

-- Drop all existing policies for contract_signatories to avoid conflicts
DROP POLICY IF EXISTS "Admin and supervisors can read all signatories" ON contract_signatories;
DROP POLICY IF EXISTS "Gestores can manage signatories of own contracts" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can see their contracts by email" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can update their signing status" ON contract_signatories;
DROP POLICY IF EXISTS "Users can manage signatories of own contracts" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can view their own records" ON contract_signatories;

-- Create simple, non-recursive policies
CREATE POLICY "Users can read own signatory records by user_id"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can read own signatory records by email"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = auth.email()::text);

CREATE POLICY "Admins can read all signatory records"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Users can update own signatory records by user_id"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own signatory records by email"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (email = auth.email()::text)
  WITH CHECK (email = auth.email()::text);

CREATE POLICY "Contract creators can manage signatories"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_signatories.contract_id 
      AND contracts.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_signatories.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all signatory records"
  ON contract_signatories
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