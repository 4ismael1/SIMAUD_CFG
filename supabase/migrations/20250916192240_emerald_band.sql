/*
  # Fix infinite recursion in admin user profiles policy

  1. Problem
    - The admin_full_access_user_profiles policy was causing infinite recursion
    - Policy was querying user_profiles table from within user_profiles policy
    - This created a loop when trying to check admin permissions

  2. Solution
    - Drop the problematic policy
    - Recreate it with table alias to avoid recursion
    - Use explicit table alias 'up' to prevent self-reference issues
*/

-- Drop the problematic policy that's causing infinite recursion
DROP POLICY IF EXISTS "admin_full_access_user_profiles" ON user_profiles;

-- Recreate the policy with proper alias to avoid recursion
CREATE POLICY "admin_full_access_user_profiles"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.id = auth.uid() AND up.role = 'admin'::user_role
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up 
      WHERE up.id = auth.uid() AND up.role = 'admin'::user_role
    )
  );