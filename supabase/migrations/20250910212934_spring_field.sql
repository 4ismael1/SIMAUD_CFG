/*
# Actualizar sistema de firmantes para usuarios

1. Modificaciones a contract_signatories
   - Agregar relación con users cuando sea posible
   - Mejorar políticas para firmantes
   - Agregar estados de firma

2. Nuevas políticas RLS
   - Usuarios pueden ver contratos donde son firmantes
   - Solo contratos aprobados son visibles para firmantes

3. Funciones auxiliares
   - Verificar si usuario es firmante de un contrato
*/

-- Agregar columna user_id opcional para vincular firmantes registrados
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_signatories' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE contract_signatories ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Agregar columna status para seguimiento de estado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contract_signatories' AND column_name = 'status'
  ) THEN
    ALTER TABLE contract_signatories ADD COLUMN status text DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined'));
  END IF;
END $$;

-- Índice para consultas de firmantes por usuario
CREATE INDEX IF NOT EXISTS idx_contract_signatories_user_id ON contract_signatories(user_id);

-- Función para verificar si un usuario es firmante de un contrato
CREATE OR REPLACE FUNCTION is_contract_signatory(user_uuid uuid, contract_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM contract_signatories cs
    JOIN contracts c ON c.id = cs.contract_id
    WHERE (cs.user_id = user_uuid OR cs.email = (
      SELECT email FROM auth.users WHERE id = user_uuid
    ))
    AND cs.contract_id = contract_uuid
    AND c.approval_status = 'approved'
  );
$$;

-- Política para que los firmantes puedan ver contratos donde aparecen
DROP POLICY IF EXISTS "Signatories can view contracts where they are signatories" ON contracts;
CREATE POLICY "Signatories can view contracts where they are signatories"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    approval_status = 'approved' 
    AND (
      EXISTS (
        SELECT 1 
        FROM contract_signatories cs
        WHERE cs.contract_id = id 
        AND (
          cs.user_id = auth.uid() 
          OR cs.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        )
      )
    )
  );

-- Política mejorada para contract_signatories
DROP POLICY IF EXISTS "Signatories can view their own signing info" ON contract_signatories;
CREATE POLICY "Signatories can view their own signing info"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_id 
      AND c.approval_status = 'approved'
    )
  );

-- Política para que firmantes puedan actualizar su estado de firma
DROP POLICY IF EXISTS "Signatories can update their signing status" ON contract_signatories;
CREATE POLICY "Signatories can update their signing status"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_id 
      AND c.approval_status = 'approved'
    )
  )
  WITH CHECK (
    (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_id 
      AND c.approval_status = 'approved'
    )
  );

-- Función para obtener contratos de un firmante con estadísticas
CREATE OR REPLACE FUNCTION get_signatory_contracts_stats(user_uuid uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'pending_signature', (
      SELECT COUNT(*)
      FROM contract_signatories cs
      JOIN contracts c ON c.id = cs.contract_id
      WHERE (cs.user_id = user_uuid OR cs.email = (SELECT email FROM auth.users WHERE id = user_uuid))
      AND c.approval_status = 'approved'
      AND cs.status = 'pending'
    ),
    'signed', (
      SELECT COUNT(*)
      FROM contract_signatories cs
      JOIN contracts c ON c.id = cs.contract_id
      WHERE (cs.user_id = user_uuid OR cs.email = (SELECT email FROM auth.users WHERE id = user_uuid))
      AND cs.status = 'signed'
    ),
    'active', (
      SELECT COUNT(*)
      FROM contract_signatories cs
      JOIN contracts c ON c.id = cs.contract_id
      WHERE (cs.user_id = user_uuid OR cs.email = (SELECT email FROM auth.users WHERE id = user_uuid))
      AND c.status = 'active'
      AND cs.status = 'signed'
      AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
    ),
    'expired', (
      SELECT COUNT(*)
      FROM contract_signatories cs
      JOIN contracts c ON c.id = cs.contract_id
      WHERE (cs.user_id = user_uuid OR cs.email = (SELECT email FROM auth.users WHERE id = user_uuid))
      AND c.status = 'active'
      AND cs.status = 'signed'
      AND c.end_date IS NOT NULL 
      AND c.end_date < CURRENT_DATE
    )
  );
$$;