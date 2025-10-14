/*
  # Corregir políticas para actualización de contratos durante aprobación

  1. Políticas para Supervisores
    - Permitir actualizar contracts durante proceso de aprobación
    - Permitir actualizar approval_status específicamente
  
  2. Verificar Funciones Helper
    - Asegurar que is_admin_or_supervisor funciona correctamente
*/

-- Verificar que la función is_admin_or_supervisor existe y funciona
DO $$
BEGIN
    -- Test de la función (esto debería ejecutarse sin error si la función existe)
    PERFORM is_admin_or_supervisor('00000000-0000-0000-0000-000000000000');
    RAISE NOTICE 'Función is_admin_or_supervisor existe y funciona correctamente';
EXCEPTION
    WHEN undefined_function THEN
        RAISE EXCEPTION 'Función is_admin_or_supervisor no existe. Debe crearse primero.';
END $$;

-- Eliminar y recrear política específica para supervisores actualizando contratos
DROP POLICY IF EXISTS "Supervisors can update contracts for approval" ON contracts;

CREATE POLICY "Supervisors can update contracts for approval"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Política adicional más específica para actualizar approval_status
DROP POLICY IF EXISTS "Supervisors can update approval status" ON contracts;

CREATE POLICY "Supervisors can update approval status"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid()) AND
    approval_status IN ('pending_approval', 'approved', 'rejected')
  )
  WITH CHECK (
    is_admin_or_supervisor(auth.uid())
  );

-- Asegurar permisos en la tabla contracts
GRANT SELECT, UPDATE ON contracts TO authenticated;

-- Verificar que RLS está habilitado
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Log para confirmar
DO $$
BEGIN
    RAISE NOTICE 'Políticas de actualización de contratos configuradas correctamente';
END $$;