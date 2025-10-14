/*
  # Fix contract insertion RLS policy

  1. Security Changes
    - Drop existing restrictive INSERT policy
    - Add permissive INSERT policy for all authenticated users
    - Ensure users can only create contracts with their own user_id

  2. RLS Policies
    - Allow any authenticated user to insert contracts
    - Enforce created_by = auth.uid() constraint
    - Maintain existing SELECT and UPDATE policies
*/

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Gestores can create contracts" ON contracts;

-- Create a more permissive INSERT policy for all authenticated users
CREATE POLICY "Authenticated users can create own contracts"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Also ensure we have a proper SELECT policy for users to see their own contracts
DROP POLICY IF EXISTS "Users can read own contracts" ON contracts;

CREATE POLICY "Users can read own contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- And a proper UPDATE policy for users to manage their own contracts
DROP POLICY IF EXISTS "Users can update own contracts" ON contracts;

CREATE POLICY "Users can update own contracts"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Ensure RLS is enabled on the contracts table
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;