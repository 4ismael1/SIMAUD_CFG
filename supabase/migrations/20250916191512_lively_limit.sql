/*
  # Admin User Profiles Management Permissions

  1. New Policies
    - Add policy for admin users to manage all user profiles
    - Allow admins to read, update, insert, and delete any user profile
    
  2. Security
    - Policy checks if current user has 'admin' role
    - Maintains existing RLS security for non-admin users
    - Service role retains full access

  3. Changes
    - Adds `admin_full_access_user_profiles` policy for admin role
    - Allows administrators to edit any user in the system
    - Preserves existing user self-access and read permissions
*/

-- Add policy for admin users to have full access to user_profiles
CREATE POLICY "admin_full_access_user_profiles"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.id = auth.uid() 
      AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles AS up
      WHERE up.id = auth.uid() 
      AND up.role = 'admin'
    )
  );