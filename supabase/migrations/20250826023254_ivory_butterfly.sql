/*
  # Fix infinite recursion in user_profiles RLS policies

  1. Problem
    - The "Admins can read all user profiles" policy creates infinite recursion
    - It queries user_profiles table within the policy for user_profiles table
    - This causes the policy to call itself infinitely

  2. Solution  
    - Remove the recursive admin policy
    - Keep simple, direct policies that don't create circular dependencies
    - Admin access will be handled at the application level when needed

  3. Security
    - Users can read/update their own profiles
    - Service role maintains full access
    - Profile creation allowed during signup
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can read all user profiles" ON user_profiles;

-- Keep existing safe policies:
-- 1. "Users can read own profile" - (uid() = id) - safe, direct check
-- 2. "Users can update own profile" - (uid() = id) - safe, direct check  
-- 3. "Allow profile creation during signup" - true - safe for inserts
-- 4. "Service role can read all profiles" - for service_role only - safe

-- Note: Admin functionality will be handled at the application level
-- by checking the user's role from their own profile first, then making
-- subsequent queries as needed, avoiding the recursion issue.