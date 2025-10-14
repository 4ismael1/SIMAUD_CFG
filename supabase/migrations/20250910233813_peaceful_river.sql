/*
  # Fix signatories visibility for contract creators (Gestores)

  1. Security
    - Allow contract creators to see signatories of their own contracts
    - Maintain existing policies for signatories to see their own records
    - Keep service role access for system operations

  2. Changes
    - Add policy for contract owners to view their contract signatories
    - Ensure gestores can see signatories when viewing contract details
*/

-- Drop existing policies to rebuild them properly
DROP POLICY IF EXISTS "signatories_own_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_own_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_allow_insert" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_allow_update" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_allow_delete" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_full" ON contract_signatories;

-- Create comprehensive policies for contract_signatories
CREATE POLICY "signatories_select_own_records"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see their own signatory records
    auth.uid() = user_id OR auth.email() = email
  );

CREATE POLICY "signatories_select_contract_owners"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    -- Contract creators can see all signatories of their contracts
    contract_id IN (
      SELECT id FROM contracts WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "signatories_insert_authenticated"
  ON contract_signatories
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "signatories_update_own_or_contract_owner"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (
    -- Can update own records or if owner of the contract
    auth.uid() = user_id 
    OR auth.email() = email
    OR contract_id IN (
      SELECT id FROM contracts WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id 
    OR auth.email() = email
    OR contract_id IN (
      SELECT id FROM contracts WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "signatories_delete_contract_owner"
  ON contract_signatories
  FOR DELETE
  TO authenticated
  USING (
    -- Contract owners can delete signatories from their contracts
    contract_id IN (
      SELECT id FROM contracts WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "signatories_service_role"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);