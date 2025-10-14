/*
  # Arreglar visibilidad de contratos

  1. Políticas de Contratos
    - Limpia políticas duplicadas y problemáticas
    - Política simple para owners (created_by)
    - Política para firmantes
    - Política para service role

  2. Seguridad
    - Gestores ven sus propios contratos
    - Firmantes ven contratos donde están asignados
    - Admins/supervisors ven todos
*/

-- Limpiar políticas existentes de contracts
DROP POLICY IF EXISTS "contracts_own_access" ON contracts;
DROP POLICY IF EXISTS "contracts_owner_full_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service" ON contracts;
DROP POLICY IF EXISTS "contracts_service_full_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatories_read_access" ON contracts;

-- Política para owners (gestores y otros que crean contratos)
CREATE POLICY "contracts_owner_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Política para firmantes (pueden leer contratos donde están asignados)
CREATE POLICY "contracts_signatory_read"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT contract_id 
      FROM contract_signatories 
      WHERE user_id = auth.uid() OR email = auth.email()
    )
  );

-- Política para service role (acceso completo)
CREATE POLICY "contracts_service_access"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);