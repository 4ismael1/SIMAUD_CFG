/*
# Fix approval workflow to create approval records

1. Trigger Functions
   - Auto-create approval record when contract status changes to pending_approval
   - Link to current contract version

2. RLS Policies
   - Supervisors and admins can see all pending approvals
   - Gestors can see their own approval requests
   
3. Workflow Fix
   - Contract -> pending_approval -> auto-create approval record -> supervisor sees it
*/

-- Function to auto-create approval records
CREATE OR REPLACE FUNCTION create_approval_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create approval request when status changes TO pending_approval
  IF NEW.approval_status = 'pending_approval' AND 
     (OLD.approval_status IS NULL OR OLD.approval_status != 'pending_approval') THEN
    
    INSERT INTO contract_approvals (
      contract_id,
      version_number,
      requested_by,
      requested_at,
      status,
      comments
    ) VALUES (
      NEW.id,
      NEW.current_version,
      NEW.created_by,
      NOW(),
      'pending',
      'Solicitud automática de aprobación'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on contracts table
DROP TRIGGER IF EXISTS auto_create_approval_request ON contracts;
CREATE TRIGGER auto_create_approval_request
  AFTER UPDATE OF approval_status ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION create_approval_request();

-- Ensure RLS policies for contract_approvals are correct
DROP POLICY IF EXISTS "supervisors_and_admins_read_all_approvals" ON contract_approvals;
CREATE POLICY "supervisors_and_admins_read_all_approvals"
ON contract_approvals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'supervisor')
  )
);

DROP POLICY IF EXISTS "supervisors_and_admins_update_approvals" ON contract_approvals;
CREATE POLICY "supervisors_and_admins_update_approvals"
ON contract_approvals FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_profiles.id = auth.uid()
    AND user_profiles.role IN ('admin', 'supervisor')
  )
);

DROP POLICY IF EXISTS "gestors_read_own_approvals" ON contract_approvals;
CREATE POLICY "gestors_read_own_approvals"
ON contract_approvals FOR SELECT
TO authenticated
USING (requested_by = auth.uid());

-- Create a test approval record for existing pending contracts
INSERT INTO contract_approvals (
  contract_id,
  version_number,
  requested_by,
  requested_at,
  status,
  comments
)
SELECT 
  id,
  current_version,
  created_by,
  updated_at,
  'pending',
  'Registro automático para contratos existentes en aprobación'
FROM contracts 
WHERE approval_status = 'pending_approval'
AND id NOT IN (SELECT contract_id FROM contract_approvals WHERE status = 'pending');