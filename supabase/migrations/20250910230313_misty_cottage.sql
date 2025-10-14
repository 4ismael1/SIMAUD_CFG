/*
  # Fix infinite recursion in user_profiles RLS policies

  1. Problem
    - Infinite recursion detected in user_profiles policies
    - Policies were referencing the same table they're applied to

  2. Solution
    - Drop ALL existing policies on user_profiles
    - Create simple, non-recursive policies
    - Use only auth.uid() without subqueries to user_profiles
*/

-- Drop all existing policies on user_profiles to fix recursion
DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "admins_read_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "admins_update_all_profiles" ON user_profiles;
DROP POLICY IF EXISTS "allow_profile_creation" ON user_profiles;
DROP POLICY IF EXISTS "service_role_access_profiles" ON user_profiles;

-- Create simple, non-recursive policies
CREATE POLICY "enable_read_own_profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "enable_update_own_profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "enable_insert_own_profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Service role needs full access for system operations
CREATE POLICY "service_role_all_access" ON user_profiles
  FOR ALL USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');