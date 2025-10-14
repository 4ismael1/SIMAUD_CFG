/*
  # Fix all permission errors and restore functionality

  1. RLS Policies
    - Remove ALL references to auth.users table
    - Use only auth.uid() for authentication
    - Restore gestor contract access
    - Fix signatory contract access
    
  2. Security
    - Gestores can see their own contracts
    - Signatories can see contracts they're assigned to
    - Admin/supervisor access maintained
    - Service role access maintained
*/

-- Remove ALL existing RLS policies that might reference users table
DROP POLICY IF EXISTS "contracts_read_own" ON contracts;
DROP POLICY IF EXISTS "contracts_write_own" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;
DROP POLICY IF EXISTS "signatories_read_assigned_contracts" ON contracts;

DROP POLICY IF EXISTS "signatories_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;

DROP POLICY IF EXISTS "user_profiles_read_basic" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_read_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_service_access" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_email_lookup" ON user_profiles;

-- CONTRACTS: Simple policies without users table references
CREATE POLICY "contracts_owner_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_signatory_read"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT contract_id 
      FROM contract_signatories 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "contracts_service_access"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- CONTRACT_SIGNATORIES: Simple policies
CREATE POLICY "signatories_own_records"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "signatories_service_access"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- USER_PROFILES: Basic access policies
CREATE POLICY "user_profiles_own_access"
  ON user_profiles
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_read_public"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "user_profiles_service_access"
  ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);