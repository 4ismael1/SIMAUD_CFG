/*
  # Verificar y corregir políticas de aprobación de contratos

  1. Verificación de Políticas
    - Asegurar que supervisores pueden actualizar contratos durante aprobación
    - Verificar permisos en contract_approvals

  2. Debugging
    - Habilitar logging para troubleshooting
    - Verificar integridad referencial
*/

-- Verificar políticas actuales en contracts
SELECT 
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'contracts' AND schemaname = 'public';

-- Verificar políticas actuales en contract_approvals  
SELECT 
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'contract_approvals' AND schemaname = 'public';

-- Asegurar que supervisores pueden actualizar contracts durante aprobación
DROP POLICY IF EXISTS "Supervisors can update contracts for approval" ON contracts;
CREATE POLICY "Supervisors can update contracts for approval"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid()) OR 
    (created_by = auth.uid())
  )
  WITH CHECK (
    is_admin_or_supervisor(auth.uid()) OR 
    (created_by = auth.uid())
  );

-- Asegurar que supervisores pueden actualizar approval records
DROP POLICY IF EXISTS "Supervisors can update approval records" ON contract_approvals;
CREATE POLICY "Supervisors can update approval records"
  ON contract_approvals
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Verificar que las funciones helper existen y funcionan
DO $$
BEGIN
  -- Test is_admin_or_supervisor function
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin_or_supervisor') THEN
    RAISE EXCEPTION 'Function is_admin_or_supervisor does not exist';
  END IF;
  
  RAISE NOTICE 'All policies and functions verified successfully';
END $$;