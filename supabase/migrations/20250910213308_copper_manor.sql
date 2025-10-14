/*
  # Fix infinite recursion in contracts RLS policies

  1. Problem
    - The policy "Signatories can view contracts where they are signatories" creates infinite recursion
    - When querying contract_signatories with join to contracts, the contracts policy checks contract_signatories again

  2. Solution
    - Drop the problematic policy that causes circular reference
    - Keep the existing policies that work without recursion
    - The signatories can still access contracts through the contract_signatories table policies
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Signatories can view contracts where they are signatories" ON contracts;

-- The signatory access will be handled through the contract_signatories table policies instead
-- which already allow signatories to see their assigned contracts