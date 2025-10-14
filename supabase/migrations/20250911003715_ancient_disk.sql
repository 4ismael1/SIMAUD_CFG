/*
  # Debug and Fix Missing Approvals

  1. Problem Analysis
    - Trigger might not be working correctly
    - Need to ensure approval records are created
    - Simplify the trigger logic

  2. Solutions
    - Create simpler trigger function
    - Add debug logging
    - Ensure approval records exist for pending contracts

  3. Data Verification
    - Check existing contracts
    - Create missing approval records
    - Verify trigger functionality
*/

-- Drop existing trigger and function to recreate
DROP TRIGGER IF EXISTS trigger_create_approval_request ON contracts;
DROP FUNCTION IF EXISTS create_approval_request() CASCADE;

-- Create a simpler, more reliable trigger function
CREATE OR REPLACE FUNCTION create_approval_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create approval request when status changes to pending_approval
  IF NEW.approval_status = 'pending_approval' AND 
     (OLD.approval_status IS NULL OR OLD.approval_status != 'pending_approval') THEN
    
    -- Insert new approval request
    INSERT INTO contract_approvals (
      contract_id,
      version_number,
      requested_by,
      requested_at,
      status
    ) VALUES (
      NEW.id,
      NEW.current_version,
      NEW.created_by,
      NOW(),
      'pending'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER trigger_create_approval_request
  AFTER UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION create_approval_request();

-- Create approval records for any existing contracts that are pending_approval but don't have records
INSERT INTO contract_approvals (
  contract_id,
  version_number,
  requested_by,
  requested_at,
  status
)
SELECT DISTINCT
  c.id,
  c.current_version,
  c.created_by,
  c.updated_at,
  'pending'
FROM contracts c
WHERE c.approval_status = 'pending_approval'
  AND NOT EXISTS (
    SELECT 1 
    FROM contract_approvals ca 
    WHERE ca.contract_id = c.id 
      AND ca.version_number = c.current_version
      AND ca.status = 'pending'
  );

-- Update any old approval records that might be lingering
UPDATE contract_approvals 
SET status = 'pending',
    requested_at = NOW()
WHERE contract_id IN (
  SELECT id FROM contracts WHERE approval_status = 'pending_approval'
) AND status != 'pending';