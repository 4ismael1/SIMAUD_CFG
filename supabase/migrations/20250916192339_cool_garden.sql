/*
  # Revert Admin User Profile Policies

  Reverts the last two migrations related to admin permissions for user_profiles:
  1. Removes the admin_full_access_user_profiles policy that caused recursion
  2. Restores the original state before admin edit permissions were added

  ## Changes
  1. Security
    - Remove admin_full_access_user_profiles policy
    - Keep original user_profiles_own_access policy intact
    - Restore original permission model where users can only edit their own profiles
*/

-- Remove the problematic admin policy that caused infinite recursion
DROP POLICY IF EXISTS "admin_full_access_user_profiles" ON user_profiles;

-- The system will now revert to the original behavior where:
-- - Users can only edit their own profiles (user_profiles_own_access policy)
-- - Admin and supervisor roles can read all profiles (existing policies)
-- - Service role has full access (existing policy)

-- No additional policies needed - reverting to original state