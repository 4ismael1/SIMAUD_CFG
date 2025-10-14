/*
  # Fix RLS policies to eliminate permission denied errors

  1. Security Fixes
    - Drop all problematic policies that access auth.users table
    - Create simple policies using only auth.uid() and user_profiles table
    - Ensure users can read their own profiles for RLS checks
    - Allow proper contract access for all roles

  2. Tables Fixed
    - user_profiles: Simple self-access policy
    - contracts: Role-based access without auth.users references
    - contract_signatories: Direct access policies
    - contract_templates: Simple read policies

  3. Key Changes
    - No references to auth.users table anywhere
    - Only use auth.uid() and auth.email() functions
    - Simple EXISTS subqueries to user_profiles only
    - Clear separation of read/write permissions
*/

-- Drop ALL existing problematic policies
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins and supervisors can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins and supervisors can update all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow profile creation during signup" ON user_profiles;
DROP POLICY IF EXISTS "Service role can read all profiles" ON user_profiles;

DROP POLICY IF EXISTS "users_read_own_contracts_simple" ON contracts;
DROP POLICY IF EXISTS "users_create_contracts_simple" ON contracts;
DROP POLICY IF EXISTS "users_update_own_contracts_simple" ON contracts;
DROP POLICY IF EXISTS "signatories_view_approved_contracts_simple" ON contracts;
DROP POLICY IF EXISTS "service_role_full_access_contracts" ON contracts;

DROP POLICY IF EXISTS "signatories_read_own_records" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_update_own_records" ON contract_signatories;
DROP POLICY IF EXISTS "service_role_full_access_signatories" ON contract_signatories;

-- USER PROFILES: Essential for all other RLS checks
CREATE POLICY "users_read_own_profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "admins_read_all_profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() 
      AND up.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "users_update_own_profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "admins_update_all_profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() 
      AND up.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "allow_profile_creation"
  ON user_profiles
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "service_role_access_profiles"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- CONTRACTS: Simple role-based access
CREATE POLICY "users_read_own_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "admins_read_all_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "signatories_read_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    approval_status IN ('approved', 'signed', 'completed')
    AND EXISTS (
      SELECT 1 FROM contract_signatories
      WHERE contract_id = contracts.id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "users_create_contracts"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "users_update_own_contracts"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() 
    AND approval_status IN ('draft', 'rejected')
  )
  WITH CHECK (
    created_by = auth.uid()
  );

CREATE POLICY "admins_manage_all_contracts"
  ON contracts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "service_role_access_contracts"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- CONTRACT SIGNATORIES: Direct access
CREATE POLICY "signatories_read_own"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "signatories_read_by_email"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (email = auth.email()::text);

CREATE POLICY "signatories_update_own"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "signatories_update_by_email"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (email = auth.email()::text)
  WITH CHECK (email = auth.email()::text);

CREATE POLICY "admins_manage_signatories"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "service_role_access_signatories"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- CONTRACT TEMPLATES: Simple read access
CREATE POLICY "authenticated_read_templates"
  ON contract_templates
  FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "admins_manage_templates"
  ON contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  );