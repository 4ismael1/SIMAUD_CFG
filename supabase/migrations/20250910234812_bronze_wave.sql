/*
# Fix users table permission error

1. Security
   - Remove all references to auth.users table that cause permission errors
   - Use auth.uid() directly instead of querying users table
   - Keep basic RLS functionality without complex user metadata queries

2. Changes
   - Drop all policies that reference users table
   - Create simple policies using auth.uid() only
   - Ensure contracts can load without permission errors
*/

-- Clean up user_profiles policies that reference users table
DROP POLICY IF EXISTS "Allow authenticated users to read public profile info" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_service" ON user_profiles;

-- Create simple policies without users table references
CREATE POLICY "user_profiles_read_own" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_service_access" ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow reading basic profile info for contract display
CREATE POLICY "user_profiles_read_basic" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Clean up contracts policies that might reference users
DROP POLICY IF EXISTS "contracts_admin_access" ON contracts;
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;

-- Simple contracts policies
CREATE POLICY "contracts_read_own" ON contracts
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "contracts_write_own" ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_service_access" ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);