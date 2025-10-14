/*
  # Fix contract access for signatory users

  1. Security
    - Restore signatory access to their assigned contracts
    - Allow signatories to see contracts where they are assigned
    - Maintain existing policies for other roles

  2. Changes
    - Add policy for signatories to access contracts where they are assigned
    - Ensure contract_signatories policies work correctly
    - Keep simple policies without recursion
*/

-- First, drop any problematic policies
DROP POLICY IF EXISTS "signatories_read_assigned_contracts" ON contracts;

-- Restore signatory access to their assigned contracts
CREATE POLICY "signatories_read_assigned_contracts" 
ON contracts FOR SELECT 
TO authenticated 
USING (
  id IN (
    SELECT contract_id 
    FROM contract_signatories 
    WHERE (user_id = auth.uid() OR email = auth.email())
    AND status != 'declined'
  )
);

-- Ensure contract_signatories policies are correct
DROP POLICY IF EXISTS "signatories_own_records" ON contract_signatories;
CREATE POLICY "signatories_own_records" 
ON contract_signatories FOR ALL 
TO authenticated 
USING (user_id = auth.uid() OR email = auth.email())
WITH CHECK (user_id = auth.uid() OR email = auth.email());

-- Ensure user_profiles has the right access for email lookup
DROP POLICY IF EXISTS "user_profiles_email_lookup" ON user_profiles;
CREATE POLICY "user_profiles_email_lookup" 
ON user_profiles FOR SELECT 
TO authenticated 
USING (id = auth.uid() OR true); -- Allow reading all profiles for email matching