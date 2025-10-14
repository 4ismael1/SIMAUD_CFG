/*
  # Fix signatory visibility for gestores in contract details

  1. Security
    - Add policy for contract creators to see signatories of their own contracts
    - Maintain existing security for other users
    
  2. Changes
    - New policy: Contract creators can see signatories of contracts they created
    - Enables gestores to see firmantes in contract details modal
*/

-- Allow contract creators to see signatories of their own contracts
CREATE POLICY "Contract creators can see their contract signatories"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_signatories.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );