/*
  # Fix Contract Status Function

  1. Drop existing function
    - Remove the existing update_contract_status_by_date function that has wrong return type
  
  2. Create new function with correct return type
    - Returns table with contract details and status changes
    - Updates actual_status based on current date vs end_date
    - Only updates contracts that are signed and not in final states
*/

-- Drop existing function first
DROP FUNCTION IF EXISTS update_contract_status_by_date();

-- Create the function with correct return type
CREATE OR REPLACE FUNCTION update_contract_status_by_date()
RETURNS TABLE (
  contract_id uuid,
  title text,
  old_status text,
  new_status text,
  end_date date,
  updated_at timestamptz
) AS $$
DECLARE
  contract_record RECORD;
  new_actual_status text;
  today date := CURRENT_DATE;
  thirty_days_ahead date := CURRENT_DATE + interval '30 days';
BEGIN
  -- Loop through all signed contracts that are not in final states
  FOR contract_record IN 
    SELECT c.id, c.title, c.actual_status, c.end_date, c.approval_status
    FROM contracts c
    WHERE c.approval_status = 'signed'
      AND c.end_date IS NOT NULL
      AND c.actual_status NOT IN ('completed', 'cancelled', 'renewed')
  LOOP
    -- Determine new status based on dates
    IF contract_record.end_date < today THEN
      new_actual_status := 'expired';
    ELSIF contract_record.end_date <= thirty_days_ahead THEN
      new_actual_status := 'expiring_soon';
    ELSE
      new_actual_status := 'active';
    END IF;

    -- Only update if status actually changed
    IF contract_record.actual_status IS DISTINCT FROM new_actual_status THEN
      -- Update the contract
      UPDATE contracts 
      SET 
        actual_status = new_actual_status,
        updated_at = NOW()
      WHERE id = contract_record.id;

      -- Return the change details
      contract_id := contract_record.id;
      title := contract_record.title;
      old_status := contract_record.actual_status;
      new_status := new_actual_status;
      end_date := contract_record.end_date;
      updated_at := NOW();
      
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_contract_status_by_date() TO authenticated;
GRANT EXECUTE ON FUNCTION update_contract_status_by_date() TO service_role;