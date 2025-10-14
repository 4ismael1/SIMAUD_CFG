/*
  # Corregir permisos RLS para supervisor
  
  1. Políticas Actualizadas
    - Eliminar todas las políticas existentes en contract_templates y template_variables
    - Recrear políticas correctas para admin y supervisor
    - Asegurar que supervisores puedan crear, leer, actualizar y eliminar
  
  2. Seguridad
    - Usuarios normales solo pueden leer plantillas activas
    - Supervisores y admins tienen control completo
*/

-- Eliminar TODAS las políticas existentes para contract_templates
DROP POLICY IF EXISTS "Admin can manage contract templates" ON contract_templates;
DROP POLICY IF EXISTS "Users can read active contract templates" ON contract_templates;
DROP POLICY IF EXISTS "Admin and Supervisor can manage contract templates" ON contract_templates;

-- Eliminar TODAS las políticas existentes para template_variables
DROP POLICY IF EXISTS "Admin can manage template variables" ON template_variables;
DROP POLICY IF EXISTS "Users can read template variables" ON template_variables;
DROP POLICY IF EXISTS "Admin and Supervisor can manage template variables" ON template_variables;

-- Crear nuevas políticas para contract_templates
CREATE POLICY "Supervisors and Admins can manage contract templates"
  ON contract_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Users can read active contract templates"
  ON contract_templates
  FOR SELECT
  TO authenticated
  USING (
    status = 'active' OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Crear nuevas políticas para template_variables
CREATE POLICY "Supervisors and Admins can manage template variables"
  ON template_variables
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Users can read template variables"
  ON template_variables
  FOR SELECT
  TO authenticated
  USING (true);