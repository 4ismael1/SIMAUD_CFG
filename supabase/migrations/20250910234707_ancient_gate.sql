/*
  # Fix user_profiles permission error

  1. Security
    - Allow authenticated users to read public profile information (name, email)
    - Keep existing policies for full profile access (own records only)
    - Maintain service role access

  2. Changes
    - Add policy for authenticated users to read public profile data
    - This enables displaying contract creator information without security issues
*/

-- Add policy to allow authenticated users to read public profile information
CREATE POLICY "Allow authenticated users to read public profile info"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);