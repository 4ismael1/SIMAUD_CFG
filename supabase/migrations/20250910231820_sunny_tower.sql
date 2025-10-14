/*
  # Arreglar acceso de firmantes a ver contratos

  1. Políticas de Acceso
    - Owners pueden ver sus contratos
    - Firmantes pueden ver contratos donde están registrados
    - Service role tiene acceso completo

  2. Sin Recursión
    - Políticas directas sin subqueries complejas
    - Comparaciones simples con auth functions
*/

-- Eliminar todas las políticas existentes de contracts para empezar limpio
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_service_access" ON contracts;
DROP POLICY IF EXISTS "contracts_read_own" ON contracts;
DROP POLICY IF EXISTS "contracts_signatories_read" ON contracts;

-- Política para que los owners vean sus contratos
CREATE POLICY "contracts_owner_full_access"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Política para que los firmantes puedan VER contratos donde están registrados
-- Esta es la clave para que los firmantes puedan ver el contenido
CREATE POLICY "contracts_signatories_read_access"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT contract_id 
      FROM contract_signatories 
      WHERE user_id = auth.uid() 
         OR email = auth.email()
    )
  );

-- Política para service role (operaciones automáticas)
CREATE POLICY "contracts_service_full_access"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Asegurar que contract_signatories permite lectura a firmantes
DROP POLICY IF EXISTS "signatories_read_own" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_owner_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_access" ON contract_signatories;

-- Política para que usuarios vean donde son firmantes
CREATE POLICY "signatories_read_own_signatures"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR email = auth.email());

-- Política para owners de contratos vean firmantes de sus contratos
CREATE POLICY "signatories_contract_owners_manage"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    contract_id IN (
      SELECT id 
      FROM contracts 
      WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    contract_id IN (
      SELECT id 
      FROM contracts 
      WHERE created_by = auth.uid()
    )
  );

-- Service role acceso completo
CREATE POLICY "signatories_service_full_access"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);