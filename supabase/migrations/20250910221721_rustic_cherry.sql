/*
  # Mejorar flujo de aprobación de contratos y historial

  1. Funciones Helper
    - `log_contract_audit()` para registrar cambios automáticamente
    
  2. Triggers
    - `contract_approval_status_changes` para logging automático
    
  3. Políticas RLS
    - Permitir editar contratos rechazados
    - Permitir crear nuevas solicitudes de aprobación
    - Permisos para supervisores
*/

-- Función para logging automático de cambios
CREATE OR REPLACE FUNCTION log_contract_audit()
RETURNS TRIGGER AS $$
BEGIN
  -- Log cambios de approval_status
  IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
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
      NEW.id,
      CASE 
        WHEN NEW.approval_status = 'pending_approval' THEN 'status_changed'
        WHEN NEW.approval_status = 'approved' THEN 'approved'
        WHEN NEW.approval_status = 'rejected' THEN 'rejected'
        ELSE 'status_changed'
      END,
      'contract',
      NEW.id,
      jsonb_build_object('approval_status', OLD.approval_status),
      jsonb_build_object('approval_status', NEW.approval_status),
      auth.uid(),
      COALESCE(
        (SELECT name FROM user_profiles WHERE id = auth.uid()),
        'Sistema'
      ),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger para logging automático
DROP TRIGGER IF EXISTS contract_approval_status_changes ON contracts;
CREATE TRIGGER contract_approval_status_changes
  AFTER UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION log_contract_audit();

-- Asegurar que las políticas de approval estén correctas
DROP POLICY IF EXISTS "Users can create approval requests for own contracts" ON contract_approvals;
CREATE POLICY "Users can create approval requests for own contracts"
  ON contract_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_approvals.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view approvals of own contracts" ON contract_approvals;
CREATE POLICY "Users can view approvals of own contracts"
  ON contract_approvals
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_approvals.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Supervisors can update approval records" ON contract_approvals;
CREATE POLICY "Supervisors can update approval records"
  ON contract_approvals
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));

-- Política para permitir editar contratos rechazados
DROP POLICY IF EXISTS "Users can update own rejected contracts" ON contracts;
CREATE POLICY "Users can update own rejected contracts"
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

-- Política para supervisores actualizar contratos durante aprobación
DROP POLICY IF EXISTS "Supervisors can update contracts for approval" ON contracts;
CREATE POLICY "Supervisors can update contracts for approval"
  ON contracts
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));