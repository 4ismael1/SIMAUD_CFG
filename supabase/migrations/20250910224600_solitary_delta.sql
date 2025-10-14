/*
  # Fix contracts table RLS policies

  1. Problem
    - RLS policies on contracts table are trying to access auth.users table
    - This causes "permission denied for table users" error
    
  2. Solution
    - Remove policies that reference auth.users table
    - Create simple policies using only auth.uid() and public tables
    - Avoid complex subqueries that might reference restricted tables

  3. Security
    - Users can read their own contracts (created_by = auth.uid())
    - Signatories can read contracts through contract_signatories table
    - Admins/supervisors have full access through user_profiles table
*/

-- Drop all existing policies on contracts table
DROP POLICY IF EXISTS "Admin can read all contracts" ON contracts;
DROP POLICY IF EXISTS "Authenticated users can create own contracts" ON contracts;
DROP POLICY IF EXISTS "Gestores can manage own contracts" ON contracts;
DROP POLICY IF EXISTS "Signatories can view approved contracts by email" ON contracts;
DROP POLICY IF EXISTS "Supervisors can read all contracts" ON contracts;
DROP POLICY IF EXISTS "Supervisors can update approval status" ON contracts;
DROP POLICY IF EXISTS "Supervisors can update contracts for approval" ON contracts;
DROP POLICY IF EXISTS "Users can read own contracts" ON contracts;
DROP POLICY IF EXISTS "Users can update own contracts" ON contracts;
DROP POLICY IF EXISTS "Users can update own rejected contracts" ON contracts;

-- Create simple, safe policies

-- 1. Users can read their own contracts
CREATE POLICY "users_read_own_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

-- 2. Users can create contracts
CREATE POLICY "users_create_contracts"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- 3. Users can update their own draft/rejected contracts
CREATE POLICY "users_update_own_contracts"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() 
    AND approval_status IN ('draft', 'rejected')
  )
  WITH CHECK (
    created_by = auth.uid()
    AND approval_status IN ('draft', 'rejected', 'pending_approval')
  );

-- 4. Signatories can view approved contracts (simple policy)
CREATE POLICY "signatories_view_approved_contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    approval_status IN ('approved', 'signed', 'completed')
    AND EXISTS (
      SELECT 1 
      FROM contract_signatories 
      WHERE contract_id = contracts.id 
      AND user_id = auth.uid()
    )
  );

-- 5. Admin and supervisor access (simple policy using user_profiles)
CREATE POLICY "admin_supervisor_full_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'supervisor')
    )
  );

-- 6. Service role has full access
CREATE POLICY "service_role_full_access"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);