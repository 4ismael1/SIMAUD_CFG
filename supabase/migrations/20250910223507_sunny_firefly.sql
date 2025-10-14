/*
  # Arreglar políticas RLS para firmantes

  1. Políticas para contract_signatories
    - Permitir a usuarios ver registros donde su email coincida
    - Permitir ver contratos aprobados/firmados/completados
  
  2. Políticas para contracts  
    - Permitir a firmantes ver contratos donde aparecen como firmantes
    - Basado en email del usuario logueado
  
  3. Función helper para debugging
    - Verificar qué contratos debe ver cada usuario
*/

-- Eliminar políticas existentes problemáticas
DROP POLICY IF EXISTS "Signatories can view their own signing info" ON contract_signatories;
DROP POLICY IF EXISTS "Signatories can read approved contracts" ON contracts;

-- Nueva política para contract_signatories - MÁS PERMISIVA
CREATE POLICY "Signatories can see their contracts by email"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    -- El usuario puede ver si su email coincide con el email del firmante
    email = (SELECT email FROM auth.users WHERE auth.uid() = id)
    OR 
    -- O si su user_id está vinculado
    user_id = auth.uid()
  );

-- Nueva política para contracts - PERMITE VER CONTRATOS APROBADOS
CREATE POLICY "Signatories can view approved contracts by email"
  ON contracts
  FOR SELECT  
  TO authenticated
  USING (
    -- Solo contratos aprobados, firmados o completados
    approval_status IN ('approved', 'signed', 'completed')
    AND
    -- Donde el usuario aparece como firmante (por email)
    EXISTS (
      SELECT 1 FROM contract_signatories cs
      WHERE cs.contract_id = contracts.id
      AND (
        cs.email = (SELECT email FROM auth.users WHERE auth.uid() = id)
        OR cs.user_id = auth.uid()
      )
    )
  );

-- Función de debugging para verificar qué ve cada usuario
CREATE OR REPLACE FUNCTION debug_user_signatory_access(user_email text)
RETURNS TABLE (
  contract_id uuid,
  contract_title text,
  contract_status text,
  approval_status text,
  signatory_email text,
  signatory_status text,
  has_user_id boolean
) SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as contract_id,
    c.title as contract_title,
    c.status as contract_status,
    c.approval_status,
    cs.email as signatory_email,
    cs.status as signatory_status,
    (cs.user_id IS NOT NULL) as has_user_id
  FROM contracts c
  JOIN contract_signatories cs ON c.id = cs.contract_id
  WHERE cs.email = user_email
  AND c.approval_status IN ('approved', 'signed', 'completed')
  ORDER BY c.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Asegurar que los usuarios puedan ejecutar la función de debugging
GRANT EXECUTE ON FUNCTION debug_user_signatory_access(text) TO authenticated;

-- Actualizar cualquier firmante que no tenga user_id pero cuyo email coincida con un usuario
UPDATE contract_signatories 
SET user_id = u.id
FROM auth.users u
WHERE contract_signatories.email = u.email
AND contract_signatories.user_id IS NULL
AND u.email_confirmed_at IS NOT NULL;