/*
# Fix infinite recursion in contract_signatories RLS policies

This migration completely removes all problematic RLS policies on contract_signatories
and creates super simple policies that don't cause recursion.

## Changes Made:
1. Drop ALL existing policies on contract_signatories
2. Create simple, direct policies without recursion
3. Enable RLS with minimal complexity
*/

-- Drop ALL existing policies on contract_signatories to eliminate recursion
DROP POLICY IF EXISTS "signatories_own" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_read_own_signatures" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_contract_owners_manage" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_full_access" ON contract_signatories;

-- Ensure RLS is enabled
ALTER TABLE contract_signatories ENABLE ROW LEVEL SECURITY;

-- Create super simple policies that don't cause recursion
-- Policy 1: Users can see records where they are the signatory (by user_id)
CREATE POLICY "signatories_own_by_user_id" ON contract_signatories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- Policy 2: Users can see records where they are the signatory (by email)
CREATE POLICY "signatories_own_by_email" ON contract_signatories
  FOR ALL TO authenticated
  USING (auth.email() = email);

-- Policy 3: Service role has full access
CREATE POLICY "signatories_service_full" ON contract_signatories
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);