/*
  # Fix duplicate approval records

  1. Problem
    - When a contract is rejected and resubmitted, duplicate approval records are created
    - The trigger creates one and the manual code creates another

  2. Solution
    - Update the trigger to be smarter and not create duplicates
    - Remove manual approval creation from frontend code
    - Only create approval if none exists for that contract+version combination

  3. Changes
    - Recreate the trigger function to check for existing approvals
    - Let the trigger handle ALL approval creation automatically
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS auto_create_approval_request ON contracts;
DROP FUNCTION IF EXISTS create_approval_request();

-- Create improved function that prevents duplicates
CREATE OR REPLACE FUNCTION create_approval_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create approval request if status changed TO pending_approval
  IF TG_OP = 'UPDATE' AND 
     OLD.approval_status != 'pending_approval' AND 
     NEW.approval_status = 'pending_approval' THEN
    
    -- Check if approval record already exists for this contract and version
    IF NOT EXISTS (
      SELECT 1 FROM contract_approvals 
      WHERE contract_id = NEW.id 
      AND version_number = NEW.current_version 
      AND status = 'pending'
    ) THEN
      -- Create new approval request
      INSERT INTO contract_approvals (
        contract_id,
        version_number,
        requested_by,
        status,
        comments
      ) VALUES (
        NEW.id,
        NEW.current_version,
        NEW.created_by,
        'pending',
        'Solicitud automática de aprobación'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;