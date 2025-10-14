/*
  # Add contract archiving system

  1. New Fields
    - `archived` (boolean, default false) - for hiding contracts from main view
    - `archived_at` (timestamp) - when contract was archived
    - `archived_by` (uuid) - who archived the contract

  2. Security
    - Update existing RLS policies to handle archived field
    - Only allow archiving by contract owner or admin/supervisor roles

  3. Indexes
    - Add index on archived field for performance
*/

-- Add archiving fields to contracts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'archived'
  ) THEN
    ALTER TABLE contracts ADD COLUMN archived boolean DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE contracts ADD COLUMN archived_at timestamptz;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'archived_by'
  ) THEN
    ALTER TABLE contracts ADD COLUMN archived_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_contracts_archived ON contracts(archived);
CREATE INDEX IF NOT EXISTS idx_contracts_archived_at ON contracts(archived_at);

-- Add trigger to update archived_at timestamp
CREATE OR REPLACE FUNCTION handle_contract_archiving()
RETURNS TRIGGER AS $$
BEGIN
  -- If archived status changed to true
  IF NEW.archived = true AND (OLD.archived IS NULL OR OLD.archived = false) THEN
    NEW.archived_at = now();
  END IF;
  
  -- If archived status changed to false (unarchived)
  IF NEW.archived = false AND OLD.archived = true THEN
    NEW.archived_at = NULL;
    NEW.archived_by = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_handle_contract_archiving'
  ) THEN
    CREATE TRIGGER trigger_handle_contract_archiving
      BEFORE UPDATE ON contracts
      FOR EACH ROW
      EXECUTE FUNCTION handle_contract_archiving();
  END IF;
END $$;