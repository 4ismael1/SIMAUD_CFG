/*
  # Agregar rol de Gestor de Contratos

  1. Roles
    - Agregar 'gestor' al enum user_role
    - Actualizar políticas RLS para incluir gestor

  2. Políticas
    - Gestores pueden crear y gestionar sus propios contratos
    - Gestores pueden ver plantillas activas
    - Gestores pueden ver variables del sistema
    - Gestores pueden enviar contratos a aprobación

  3. Validaciones
    - Solo gestores, supervisores y admins pueden crear contratos
    - Gestores solo pueden editar contratos en estado draft
*/

-- Agregar 'gestor' al enum existente
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumtypid = 'user_role'::regtype 
        AND enumlabel = 'gestor'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'gestor';
    END IF;
END $$;

-- Función helper para verificar si es gestor, supervisor o admin
CREATE OR REPLACE FUNCTION is_manager_or_above(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = user_id 
    AND role IN ('gestor', 'supervisor', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Actualizar políticas para contracts
DROP POLICY IF EXISTS "Users can manage own contracts" ON contracts;

-- Política para que gestores puedan crear contratos
CREATE POLICY "Gestores can create contracts"
  ON contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_manager_or_above(auth.uid()) AND created_by = auth.uid()
  );

-- Política para que gestores puedan ver y editar sus propios contratos
CREATE POLICY "Gestores can manage own contracts"
  ON contracts
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid() OR 
    is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    (created_by = auth.uid() AND approval_status = 'draft') OR 
    is_admin_or_supervisor(auth.uid())
  );

-- Actualizar política de plantillas para gestores
DROP POLICY IF EXISTS "Users can read active contract templates" ON contract_templates;

CREATE POLICY "Gestores can read active contract templates"
  ON contract_templates
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' OR 
    is_admin_or_supervisor(auth.uid())
  );

-- Política para variables - gestores pueden leer
DROP POLICY IF EXISTS "Users can read template variables" ON template_variables;

CREATE POLICY "Gestores can read template variables"
  ON template_variables
  FOR SELECT
  TO authenticated
  USING (true);

-- Actualizar políticas de contract_approvals para gestores
CREATE POLICY "Gestores can create approval requests"
  ON contract_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_manager_or_above(auth.uid()) AND
    requested_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_id 
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Gestores can view own approval requests"
  ON contract_approvals
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid() OR
    is_admin_or_supervisor(auth.uid())
  );

-- Política para contract_signatories - gestores pueden gestionar firmantes de sus contratos
CREATE POLICY "Gestores can manage signatories of own contracts"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_signatories.contract_id 
      AND (created_by = auth.uid() OR is_admin_or_supervisor(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_signatories.contract_id 
      AND (created_by = auth.uid() OR is_admin_or_supervisor(auth.uid()))
    )
  );

-- Política para contract_versions - gestores pueden ver versiones de sus contratos
CREATE POLICY "Gestores can view versions of own contracts"
  ON contract_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_versions.contract_id 
      AND (created_by = auth.uid() OR is_admin_or_supervisor(auth.uid()))
    )
  );

-- Política para contract_audit_logs - gestores pueden ver logs de sus contratos
CREATE POLICY "Gestores can view audit logs of own contracts"
  ON contract_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE id = contract_audit_logs.contract_id 
      AND (created_by = auth.uid() OR is_admin_or_supervisor(auth.uid()))
    )
  );