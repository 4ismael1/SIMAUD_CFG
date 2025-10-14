/*
  # Actualizar políticas RLS para rol supervisor

  Permite a los supervisores gestionar plantillas de contratos y variables del sistema.
*/

-- Políticas para contract_templates
DROP POLICY IF EXISTS "Admin can manage contract templates" ON contract_templates;
DROP POLICY IF EXISTS "Users can read active contract templates" ON contract_templates;

CREATE POLICY "Admin and Supervisor can manage contract templates"
  ON contract_templates
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Users can read active contract templates"
  ON contract_templates
  FOR SELECT
  TO public
  USING (
    status = 'active' OR 
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

-- Políticas para template_variables  
DROP POLICY IF EXISTS "Admin can manage template variables" ON template_variables;
DROP POLICY IF EXISTS "Users can read template variables" ON template_variables;

CREATE POLICY "Admin and Supervisor can manage template variables"
  ON template_variables
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Users can read template variables"
  ON template_variables
  FOR SELECT
  TO public
  USING (true);