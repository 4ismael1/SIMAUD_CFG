/*
  # Fix signatories policies and display

  1. Security
    - Create simple RLS policies for contract_signatories
    - Allow reading signatories for contract owners and signatories themselves
    - Allow admin/supervisor access

  2. Functions  
    - Add function to update contract status when all signatures are complete
*/

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "service_role_access_signatories" ON contract_signatories;
DROP POLICY IF EXISTS "admins_manage_signatories" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_read_own" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_update_own" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_read_by_email" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_update_by_email" ON contract_signatories;

-- Create simple policies for contract_signatories
CREATE POLICY "contract_signatories_read_own_contracts" ON contract_signatories
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_signatories.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "contract_signatories_read_as_signatory" ON contract_signatories
  FOR SELECT TO authenticated
  USING (
    contract_signatories.user_id = auth.uid() 
    OR contract_signatories.email = auth.email()
  );

CREATE POLICY "contract_signatories_admin_access" ON contract_signatories
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "contract_signatories_update_own_signature" ON contract_signatories
  FOR UPDATE TO authenticated
  USING (
    contract_signatories.user_id = auth.uid() 
    OR contract_signatories.email = auth.email()
  )
  WITH CHECK (
    contract_signatories.user_id = auth.uid() 
    OR contract_signatories.email = auth.email()
  );

CREATE POLICY "contract_signatories_service_role" ON contract_signatories
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to check and update contract status when all signatures are complete
CREATE OR REPLACE FUNCTION update_contract_status_on_complete_signatures()
RETURNS TRIGGER AS $$
DECLARE
  total_signatories INTEGER;
  completed_signatures INTEGER;
  contract_record RECORD;
BEGIN
  -- Get the contract
  SELECT * INTO contract_record FROM contracts WHERE id = NEW.contract_id;
  
  -- Only process if contract is approved
  IF contract_record.approval_status != 'approved' THEN
    RETURN NEW;
  END IF;

  -- Count total signatories for this contract
  SELECT COUNT(*) INTO total_signatories
  FROM contract_signatories 
  WHERE contract_id = NEW.contract_id;

  -- Count completed signatures
  SELECT COUNT(*) INTO completed_signatures
  FROM contract_signatories 
  WHERE contract_id = NEW.contract_id 
  AND signed_at IS NOT NULL;

  -- If all signatures are complete, update contract status
  IF completed_signatures = total_signatories AND total_signatories > 0 THEN
    UPDATE contracts 
    SET 
      approval_status = 'signed',
      updated_at = NOW()
    WHERE id = NEW.contract_id;

    -- Log audit entry
    INSERT INTO contract_audit_logs (
      contract_id,
      action,
      entity_type,
      entity_id,
      new_values,
      user_id,
      user_name,
      timestamp
    ) VALUES (
      NEW.contract_id,
      'status_changed',
      'contract',
      NEW.contract_id,
      jsonb_build_object(
        'approval_status', 'signed',
        'completed_signatures', completed_signatures,
        'total_signatories', total_signatories
      ),
      NEW.user_id,
      (SELECT name FROM user_profiles WHERE id = NEW.user_id),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for signature completion
DROP TRIGGER IF EXISTS trigger_update_contract_on_signature_complete ON contract_signatories;
CREATE TRIGGER trigger_update_contract_on_signature_complete
  AFTER UPDATE ON contract_signatories
  FOR EACH ROW
  WHEN (OLD.signed_at IS NULL AND NEW.signed_at IS NOT NULL)
  EXECUTE FUNCTION update_contract_status_on_complete_signatures();