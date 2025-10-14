/*
  # Mejoras para vinculación y visibilidad de contratos para firmantes

  1. Funciones automáticas para vincular firmantes con usuarios
  2. Triggers para vinculación automática
  3. Estadísticas mejoradas para firmantes
  4. Políticas RLS actualizadas
*/

-- Eliminar función existente si existe
DROP FUNCTION IF EXISTS get_signatory_contracts_stats(uuid);

-- Función para vincular automáticamente firmantes con usuarios por email
CREATE OR REPLACE FUNCTION link_signatory_to_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Si el firmante no tiene user_id asignado, intentar vincularlo
  IF NEW.user_id IS NULL THEN
    UPDATE contract_signatories 
    SET user_id = (
      SELECT id FROM user_profiles 
      WHERE email = NEW.email 
      LIMIT 1
    )
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para vincular firmantes existentes cuando se crea un usuario
CREATE OR REPLACE FUNCTION link_existing_signatories_to_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Vincular firmantes existentes que tengan el mismo email
  UPDATE contract_signatories 
  SET user_id = NEW.id
  WHERE email = NEW.email 
    AND user_id IS NULL;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Función para obtener estadísticas de contratos para firmantes
CREATE OR REPLACE FUNCTION get_signatory_contracts_stats(p_user_id uuid)
RETURNS TABLE(
  pending_signature integer,
  signed integer,
  active integer,
  expired integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(CASE 
      WHEN cs.status = 'pending' 
        AND c.approval_status IN ('approved', 'signed', 'completed')
        AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
      THEN 1 
    END)::integer as pending_signature,
    
    COUNT(CASE 
      WHEN cs.status = 'signed' 
        AND c.approval_status IN ('approved', 'signed', 'completed')
      THEN 1 
    END)::integer as signed,
    
    COUNT(CASE 
      WHEN cs.status = 'signed' 
        AND c.status = 'active'
        AND c.approval_status IN ('approved', 'signed', 'completed')
        AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE)
      THEN 1 
    END)::integer as active,
    
    COUNT(CASE 
      WHEN c.end_date < CURRENT_DATE
        AND c.approval_status IN ('approved', 'signed', 'completed')
      THEN 1 
    END)::integer as expired
    
  FROM contract_signatories cs
  INNER JOIN contracts c ON cs.contract_id = c.id
  WHERE (cs.user_id = p_user_id OR cs.email = (
    SELECT email FROM user_profiles WHERE id = p_user_id
  ))
  AND c.approval_status IN ('approved', 'signed', 'completed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear triggers para vinculación automática
DROP TRIGGER IF EXISTS trigger_link_signatory_to_user ON contract_signatories;
CREATE TRIGGER trigger_link_signatory_to_user
  AFTER INSERT ON contract_signatories
  FOR EACH ROW EXECUTE FUNCTION link_signatory_to_user();

DROP TRIGGER IF EXISTS trigger_link_existing_signatories ON user_profiles;
CREATE TRIGGER trigger_link_existing_signatories
  AFTER INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION link_existing_signatories_to_new_user();

-- Actualizar políticas RLS para mejor acceso de firmantes
DROP POLICY IF EXISTS "Signatories can view their own signing info" ON contract_signatories;
CREATE POLICY "Signatories can view their own signing info"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    (user_id = auth.uid()) 
    OR (email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_signatories.contract_id 
        AND c.approval_status IN ('approved', 'signed', 'completed')
    ))
  );

-- Mejorar política para actualización de estado de firmantes
DROP POLICY IF EXISTS "Signatories can update their signing status" ON contract_signatories;
CREATE POLICY "Signatories can update their signing status"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() OR email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_signatories.contract_id 
        AND c.approval_status = 'approved'
    )
  )
  WITH CHECK (
    (user_id = auth.uid() OR email = (SELECT email FROM user_profiles WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_signatories.contract_id 
        AND c.approval_status = 'approved'
    )
  );

-- Vincular firmantes existentes con usuarios por email (migración de datos)
UPDATE contract_signatories 
SET user_id = (
  SELECT up.id 
  FROM user_profiles up 
  WHERE up.email = contract_signatories.email
)
WHERE user_id IS NULL 
  AND EXISTS (
    SELECT 1 
    FROM user_profiles up 
    WHERE up.email = contract_signatories.email
  );