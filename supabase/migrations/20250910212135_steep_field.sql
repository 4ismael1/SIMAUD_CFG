/*
  # Agregar relación foreign key faltante

  1. Foreign Key
    - Agregar foreign key constraint entre `contract_approvals.requested_by` y `user_profiles.id`
    - Permitir que la relación sea opcional (SET NULL si se elimina el usuario)
*/

-- Agregar foreign key constraint para requested_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'contract_approvals_requested_by_fkey' 
    AND table_name = 'contract_approvals'
  ) THEN
    ALTER TABLE contract_approvals 
    ADD CONSTRAINT contract_approvals_requested_by_fkey 
    FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;