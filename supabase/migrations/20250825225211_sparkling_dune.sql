/*
  # Fix infinite recursion in RLS policies

  The infinite recursion error occurs because the admin policy tries to check 
  if a user is admin by querying the same table it's protecting, creating a loop.

  ## Changes
  1. Drop all existing policies
  2. Create simple, non-recursive policies
  3. Remove the problematic admin policy that caused recursion
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Allow profile creation during signup" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Create simple, non-recursive policies
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow profile creation during signup (for authenticated and anonymous users)
CREATE POLICY "Allow profile creation during signup"
  ON user_profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Simple admin read policy without recursion
-- Admins will be handled at the application level, not RLS level
CREATE POLICY "Service role can read all profiles"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);