/*
  # Eliminar políticas dependientes y recrear funciones helper

  1. Políticas a Eliminar
    - Políticas que dependen de is_manager_or_above()
    - Políticas que dependen de is_gestor()
    
  2. Funciones Helper
    - Recrear is_manager_or_above() con parámetros correctos
    - Recrear is_gestor() para verificaciones específicas
    - Recrear get_signatory_contracts_stats()
    
  3. Recrear Políticas
    - Políticas actualizadas para gestores
    - Permisos correctos para envío a aprobación
*/

-- Eliminar políticas dependientes primero
DROP POLICY IF EXISTS "Gestores can create contracts" ON contracts;
DROP POLICY IF EXISTS "Gestores can create approval requests" ON contract_approvals;
DROP POLICY IF EXISTS "Gestores can manage own contracts" ON contracts;
DROP POLICY IF EXISTS "Gestores can view own approval requests" ON contract_approvals;

-- Eliminar funciones existentes
DROP FUNCTION IF EXISTS is_manager_or_above(uuid);
DROP FUNCTION IF EXISTS is_gestor(uuid);
DROP FUNCTION IF EXISTS get_signatory_contracts_stats(uuid);

-- Recrear funciones helper con SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_manager_or_above(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = user_uuid 
    AND role IN ('admin', 'supervisor', 'gestor')
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_gestor(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = user_uuid 
    AND role = 'gestor'
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_signatory_contracts_stats(user_uuid uuid)
RETURNS TABLE(
  pending_signature bigint,
  signed bigint,
  active bigint,
  expired bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE cs.status = 'pending') as pending_signature,
    COUNT(*) FILTER (WHERE cs.status = 'signed') as signed,
    COUNT(*) FILTER (WHERE c.status = 'active' AND cs.status = 'signed') as active,
    COUNT(*) FILTER (WHERE c.end_date < CURRENT_DATE AND cs.status = 'signed') as expired
  FROM contract_signatories cs
  JOIN contracts c ON c.id = cs.contract_id
  LEFT JOIN user_profiles up ON up.id = user_uuid
  WHERE (cs.user_id = user_uuid OR cs.email = up.email)
    AND c.approval_status = 'approved';
END;
$$;

-- Otorgar permisos de ejecución
GRANT EXECUTE ON FUNCTION is_manager_or_above(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION is_gestor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_signatory_contracts_stats(uuid) TO authenticated;

-- Recrear políticas para contratos
CREATE POLICY "Gestores can create contracts" ON contracts
  FOR INSERT TO authenticated
  WITH CHECK (is_gestor(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Gestores can manage own contracts" ON contracts
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND is_gestor(auth.uid()))
  WITH CHECK (created_by = auth.uid() AND is_gestor(auth.uid()));

-- Recrear políticas para aprobaciones
CREATE POLICY "Gestores can create approval requests" ON contract_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    is_gestor(auth.uid()) 
    AND requested_by = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_approvals.contract_id 
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Gestores can view own approval requests" ON contract_approvals
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() AND is_gestor(auth.uid()));

-- Otorgar permisos necesarios en tablas
GRANT SELECT, INSERT, UPDATE ON contracts TO authenticated;
GRANT SELECT, INSERT ON contract_approvals TO authenticated;
GRANT SELECT ON user_profiles TO authenticated;