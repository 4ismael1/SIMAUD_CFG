/*
  # Restore working RLS policies

  1. Security
    - Restore original working policies that don't cause recursion
    - Keep simple and direct policy conditions
    - Avoid cross-table references in RLS policies

  2. Changes
    - Drop all problematic policies added recently
    - Restore minimal working policies
    - Add simple signatories policy for contract owners
*/

-- Drop all recent policies that might cause recursion
DROP POLICY IF EXISTS "contracts_own_access" ON contracts;
DROP POLICY IF EXISTS "contracts_admin_read" ON contracts;
DROP POLICY IF EXISTS "contracts_service_role" ON contracts;
DROP POLICY IF EXISTS "signatories_select_contract_owners" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_select_own_records" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_insert_authenticated" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_update_own_or_contract_owner" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_delete_contract_owner" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;

-- Restore simple working policies for contracts
CREATE POLICY "contracts_owner_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_admin_access"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "contracts_service_access"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Restore simple working policies for signatories
CREATE POLICY "signatories_own_records"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR email = auth.email())
  WITH CHECK (user_id = auth.uid() OR email = auth.email());

CREATE POLICY "signatories_contract_access"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    -- Contract owner can manage signatories
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = contract_signatories.contract_id
      AND contracts.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts
      WHERE contracts.id = contract_signatories.contract_id
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "signatories_service_access"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);