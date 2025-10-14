/*
  # Sistema completo de gestión de contratos - Versión corregida

  1. Nuevas tablas:
     - contract_signatories: Firmantes de contratos
     - contract_versions: Control de versiones
     - contract_approvals: Cola de aprobaciones
     - contract_audit_logs: Auditoría completa

  2. Actualización de tabla contracts:
     - Nuevas columnas para el flujo completo
     - Estados de aprobación y firma
     - Información adicional del contrato

  3. Políticas RLS:
     - Acceso por roles (admin, supervisor, user)
     - Firmantes solo ven contratos aprobados

  4. Triggers:
     - Versionado automático
     - Timestamps de actualización
*/

-- Función para manejar updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

-- Actualizar tabla contracts con nuevas columnas
DO $$
BEGIN
  -- Agregar columnas si no existen
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'approval_status') THEN
    ALTER TABLE contracts ADD COLUMN approval_status text DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'signed', 'completed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'current_version') THEN
    ALTER TABLE contracts ADD COLUMN current_version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'approved_by') THEN
    ALTER TABLE contracts ADD COLUMN approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'approved_at') THEN
    ALTER TABLE contracts ADD COLUMN approved_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'rejection_reason') THEN
    ALTER TABLE contracts ADD COLUMN rejection_reason text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'contract_value') THEN
    ALTER TABLE contracts ADD COLUMN contract_value decimal(15,2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'start_date') THEN
    ALTER TABLE contracts ADD COLUMN start_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'end_date') THEN
    ALTER TABLE contracts ADD COLUMN end_date date;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'generated_content') THEN
    ALTER TABLE contracts ADD COLUMN generated_content text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'notes') THEN
    ALTER TABLE contracts ADD COLUMN notes text;
  END IF;
END $$;

-- Tabla de firmantes de contratos
CREATE TABLE IF NOT EXISTS contract_signatories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL CHECK (role IN ('client', 'witness', 'contractor')),
  signing_order integer NOT NULL DEFAULT 1,
  signed_at timestamptz,
  signature_url text,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de versiones de contratos
CREATE TABLE IF NOT EXISTS contract_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  variables_data jsonb DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  change_summary text,
  UNIQUE(contract_id, version_number)
);

-- Tabla de aprobaciones de contratos
CREATE TABLE IF NOT EXISTS contract_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  comments text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de auditoría de contratos
CREATE TABLE IF NOT EXISTS contract_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name text,
  ip_address inet,
  user_agent text,
  timestamp timestamptz DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatories ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para contracts
DROP POLICY IF EXISTS "Users can manage own contracts" ON contracts;
DROP POLICY IF EXISTS "Admin can read all contracts" ON contracts;
DROP POLICY IF EXISTS "Supervisors can read all contracts" ON contracts;

CREATE POLICY "Users can manage own contracts"
  ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Admin can read all contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Supervisors can read all contracts"
  ON contracts
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Políticas para contract_signatories
CREATE POLICY "Users can manage signatories of own contracts"
  ON contract_signatories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_signatories.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "Admin and supervisors can read all signatories"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Signatories can view their own signing info"
  ON contract_signatories
  FOR SELECT
  TO authenticated
  USING (
    email IN (
      SELECT email FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Políticas para contract_versions
CREATE POLICY "Users can manage versions of own contracts"
  ON contract_versions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_versions.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "Admin and supervisors can read all versions"
  ON contract_versions
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

-- Políticas para contract_approvals
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

CREATE POLICY "Admin and supervisors can manage all approvals"
  ON contract_approvals
  FOR ALL
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can view approvals of own contracts"
  ON contract_approvals
  FOR SELECT
  TO authenticated
  USING (
    requested_by = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_approvals.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

-- Políticas para contract_audit_logs
CREATE POLICY "Admin can read all audit logs"
  ON contract_audit_logs
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can view audit logs of own contracts"
  ON contract_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_audit_logs.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

-- Triggers para updated_at
DROP TRIGGER IF EXISTS handle_contracts_updated_at ON contracts;
CREATE TRIGGER handle_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS handle_contract_signatories_updated_at ON contract_signatories;
CREATE TRIGGER handle_contract_signatories_updated_at
  BEFORE UPDATE ON contract_signatories
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Función para crear versiones automáticamente
CREATE OR REPLACE FUNCTION create_contract_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo crear versión si el contenido o variables cambiaron
  IF OLD.content IS DISTINCT FROM NEW.content OR 
     OLD.variables_data IS DISTINCT FROM NEW.variables_data THEN
    
    -- Incrementar número de versión
    NEW.current_version = COALESCE(OLD.current_version, 0) + 1;
    
    -- Insertar nueva versión
    INSERT INTO contract_versions (
      contract_id,
      version_number,
      content,
      variables_data,
      created_by,
      change_summary
    ) VALUES (
      NEW.id,
      NEW.current_version,
      NEW.content,
      NEW.variables_data,
      NEW.created_by,
      CASE 
        WHEN OLD.content IS DISTINCT FROM NEW.content AND OLD.variables_data IS DISTINCT FROM NEW.variables_data THEN
          'Actualización de contenido y variables'
        WHEN OLD.content IS DISTINCT FROM NEW.content THEN
          'Actualización de contenido'
        ELSE
          'Actualización de variables'
      END
    );
  END IF;
  
  RETURN NEW;
END;
$$ language plpgsql;

-- Trigger para versionado automático
DROP TRIGGER IF EXISTS contract_versioning ON contracts;
CREATE TRIGGER contract_versioning
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION create_contract_version();

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contracts_approval_status ON contracts(approval_status);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contract_signatories_contract_id ON contract_signatories(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_signatories_email ON contract_signatories(email);
CREATE INDEX IF NOT EXISTS idx_contract_versions_contract_id ON contract_versions(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_approvals_contract_id ON contract_approvals(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_approvals_status ON contract_approvals(status);
CREATE INDEX IF NOT EXISTS idx_contract_audit_logs_contract_id ON contract_audit_logs(contract_id);