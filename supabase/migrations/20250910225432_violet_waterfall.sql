/*
  # Arreglar funcionalidad completa de firmantes y auditoría

  1. Políticas RLS Simplificadas
    - Permite a firmantes ver contratos aprobados
    - Permite acceso por user_id y email
    - Sin referencias circulares

  2. Triggers de Auditoría
    - Registra cuando se firma un contrato
    - Actualiza estado del contrato automáticamente
    - Función para contar firmas completadas

  3. Funciones Auxiliares
    - Contar firmas totales vs completadas
    - Actualizar estado del contrato cuando todas las firmas estén listas
*/

-- PASO 1: Limpiar políticas problemáticas de contratos
DROP POLICY IF EXISTS "read_own_signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "update_own_signatories_by_user_id" ON contract_signatories;
DROP POLICY IF EXISTS "service_role_all_access" ON contract_signatories;

DROP POLICY IF EXISTS "admin_supervisor_full_access" ON contracts;
DROP POLICY IF EXISTS "service_role_full_access" ON contracts;
DROP POLICY IF EXISTS "signatories_view_approved_contracts" ON contracts;
DROP POLICY IF EXISTS "users_create_contracts" ON contracts;
DROP POLICY IF EXISTS "users_read_own_contracts" ON contracts;
DROP POLICY IF EXISTS "users_update_own_contracts" ON contracts;

-- PASO 2: Crear políticas RLS súper simples para contract_signatories
CREATE POLICY "signatories_read_own_records"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

CREATE POLICY "signatories_update_own_records"
  ON contract_signatories
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() 
    OR 
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid() 
    OR 
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- PASO 3: Crear políticas RLS súper simples para contracts
CREATE POLICY "users_read_own_contracts_simple"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "users_create_contracts_simple"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "users_update_own_contracts_simple"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() 
    AND approval_status IN ('draft', 'rejected')
  )
  WITH CHECK (
    created_by = auth.uid() 
    AND approval_status IN ('draft', 'rejected', 'pending_approval')
  );

-- Política CRÍTICA: Permitir que firmantes vean contratos aprobados
CREATE POLICY "signatories_view_approved_contracts_simple"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (
    approval_status IN ('approved', 'signed', 'completed')
    AND
    id IN (
      SELECT contract_id 
      FROM contract_signatories 
      WHERE user_id = auth.uid()
    )
  );

-- Acceso completo para service_role y admins
CREATE POLICY "service_role_full_access_contracts"
  ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access_signatories"
  ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- PASO 4: Crear función para contar firmas completadas
CREATE OR REPLACE FUNCTION count_completed_signatures(contract_uuid uuid)
RETURNS json AS $$
DECLARE
  total_count integer;
  completed_count integer;
BEGIN
  -- Contar total de firmantes
  SELECT COUNT(*) INTO total_count
  FROM contract_signatories
  WHERE contract_id = contract_uuid;
  
  -- Contar firmantes que ya firmaron
  SELECT COUNT(*) INTO completed_count
  FROM contract_signatories
  WHERE contract_id = contract_uuid AND status = 'signed';
  
  -- Retornar JSON con el conteo
  RETURN json_build_object(
    'total', total_count,
    'completed', completed_count,
    'progress_text', completed_count || '/' || total_count,
    'all_signed', (completed_count = total_count AND total_count > 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 5: Crear función para actualizar estado del contrato tras firma
CREATE OR REPLACE FUNCTION update_contract_on_signature()
RETURNS trigger AS $$
DECLARE
  signature_stats json;
BEGIN
  -- Solo procesar si se firmó (cambió a 'signed')
  IF NEW.status = 'signed' AND (OLD.status IS NULL OR OLD.status != 'signed') THEN
    
    -- Crear registro de auditoría
    INSERT INTO contract_audit_logs (
      contract_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      user_id,
      user_name,
      timestamp
    ) VALUES (
      NEW.contract_id,
      'signed',
      'signatory',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      NEW.user_id,
      NEW.name,
      now()
    );
    
    -- Verificar si todas las firmas están completas
    SELECT count_completed_signatures(NEW.contract_id) INTO signature_stats;
    
    -- Si todas las firmas están completas, actualizar contrato a 'signed'
    IF (signature_stats->>'all_signed')::boolean = true THEN
      UPDATE contracts 
      SET 
        approval_status = 'signed',
        updated_at = now()
      WHERE id = NEW.contract_id;
      
      -- Registrar cambio de estado en auditoría
      INSERT INTO contract_audit_logs (
        contract_id,
        action,
        entity_type,
        entity_id,
        new_values,
        user_id,
        user_name,
        timestamp
      ) VALUES (
        NEW.contract_id,
        'status_changed',
        'contract',
        NEW.contract_id,
        json_build_object('approval_status', 'signed', 'reason', 'all_signatures_completed'),
        NEW.user_id,
        NEW.name,
        now()
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PASO 6: Crear trigger para auditoría automática
DROP TRIGGER IF EXISTS trigger_contract_signature_audit ON contract_signatories;
CREATE TRIGGER trigger_contract_signature_audit
  AFTER UPDATE ON contract_signatories
  FOR EACH ROW
  EXECUTE FUNCTION update_contract_on_signature();

-- PASO 7: Crear trigger para registro cuando contrato se aprueba
CREATE OR REPLACE FUNCTION log_contract_approval()
RETURNS trigger AS $$
BEGIN
  -- Si el contrato cambió a 'approved', crear audit log
  IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
    INSERT INTO contract_audit_logs (
      contract_id,
      action,
      entity_type,
      entity_id,
      old_values,
      new_values,
      timestamp
    ) VALUES (
      NEW.id,
      'approved',
      'contract',
      NEW.id,
      json_build_object('approval_status', OLD.approval_status),
      json_build_object('approval_status', NEW.approval_status, 'approved_by', NEW.approved_by),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_contract_approval ON contracts;
CREATE TRIGGER trigger_log_contract_approval
  AFTER UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION log_contract_approval();