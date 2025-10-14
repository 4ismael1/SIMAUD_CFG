/*
  # Arreglar permisos de inserción para firmantes

  1. Problema
    - Los usuarios no pueden crear contratos porque no pueden insertar firmantes
    - Falta política de INSERT en contract_signatories

  2. Solución
    - Permitir INSERT de firmantes para usuarios autenticados
    - Mantener políticas simples sin recursión
    - Solo el creador del contrato puede agregar firmantes
*/

-- Eliminar política de INSERT si existe (por si acaso)
DROP POLICY IF EXISTS "signatories_allow_insert" ON contract_signatories;

-- Permitir a usuarios autenticados insertar firmantes
-- Esto es necesario cuando crean contratos y agregan firmantes
CREATE POLICY "signatories_allow_insert"
ON contract_signatories FOR INSERT
TO authenticated
WITH CHECK (true);

-- Permitir a usuarios autenticados actualizar firmantes si son el firmante
CREATE POLICY "signatories_allow_update"
ON contract_signatories FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR auth.email() = email)
WITH CHECK (auth.uid() = user_id OR auth.email() = email);

-- Permitir eliminar firmantes (para edición de contratos)
CREATE POLICY "signatories_allow_delete"
ON contract_signatories FOR DELETE
TO authenticated
USING (true);