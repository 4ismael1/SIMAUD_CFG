/*
  # Fix RLS Infinite Recursion

  1. Problem
    - Infinite recursion detected in policy for relation "contracts"
    - Circular dependency between contracts and user_profiles policies
    - Complex subqueries causing policy evaluation loops

  2. Solution
    - Drop ALL existing policies that cause recursion
    - Create SIMPLE policies without complex subqueries
    - Use direct comparisons with auth.uid() only
    - Avoid cross-table references in policies
*/

-- Drop all existing policies that cause recursion
DROP POLICY IF EXISTS "contracts_admin_access" ON contracts;
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatory_access" ON contracts;

-- Drop user_profiles policies that might cause issues
DROP POLICY IF EXISTS "profiles_own_read" ON user_profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON user_profiles;
DROP POLICY IF EXISTS "profiles_service" ON user_profiles;

-- Create SIMPLE contracts policies without recursion
CREATE POLICY "contracts_own_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_service_role"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create SIMPLE user_profiles policies
CREATE POLICY "user_profiles_own"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_service"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Simple read-only policy for admin/supervisor roles on contracts
-- This uses a direct column comparison to avoid recursion
CREATE POLICY "contracts_admin_read"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM auth.users 
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'supervisor')
    )
  );