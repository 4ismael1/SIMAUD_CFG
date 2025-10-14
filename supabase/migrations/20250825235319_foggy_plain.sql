/*
  # Sistema de Plantillas de Contratos

  1. Nuevas Tablas
    - `template_variables` - Variables predefinidas del sistema
    - `contract_templates` - Plantillas de contratos
    - `contracts` - Contratos generados 
    - `audit_logs` - Bitácora de cambios

  2. Seguridad
    - Habilitar RLS en todas las tablas
    - Políticas para roles admin/user según corresponde

  3. Datos iniciales
    - Variables básicas del sistema
    - Plantilla de ejemplo
*/

-- Tabla de variables predefinidas del sistema
CREATE TABLE IF NOT EXISTS template_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('text', 'date', 'number', 'select', 'textarea')),
  options text[],
  required boolean DEFAULT false,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de plantillas de contratos
CREATE TABLE IF NOT EXISTS contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  variables text[],
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de contratos generados
CREATE TABLE IF NOT EXISTS contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES contract_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL,
  variables_data jsonb DEFAULT '{}',
  client_name text,
  client_email text,
  client_phone text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabla de auditoría
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('template', 'contract', 'variable')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'deleted', 'status_changed')),
  changes jsonb DEFAULT '{}',
  user_id uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  timestamp timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE template_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'handle_template_variables_updated_at'
  ) THEN
    CREATE TRIGGER handle_template_variables_updated_at
      BEFORE UPDATE ON template_variables
      FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'handle_contract_templates_updated_at'
  ) THEN
    CREATE TRIGGER handle_contract_templates_updated_at
      BEFORE UPDATE ON contract_templates
      FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'handle_contracts_updated_at'
  ) THEN
    CREATE TRIGGER handle_contracts_updated_at
      BEFORE UPDATE ON contracts
      FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
  END IF;
END $$;

-- Políticas RLS para template_variables
CREATE POLICY "Admin can manage template variables"
  ON template_variables
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can read template variables"
  ON template_variables
  FOR SELECT
  USING (true);

-- Políticas RLS para contract_templates
CREATE POLICY "Admin can manage contract templates"
  ON contract_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can read active contract templates"
  ON contract_templates
  FOR SELECT
  USING (status = 'active' OR EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ));

-- Políticas RLS para contracts
CREATE POLICY "Users can manage own contracts"
  ON contracts
  FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "Admin can read all contracts"
  ON contracts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Políticas RLS para audit_logs
CREATE POLICY "Admin can read audit logs"
  ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Insertar variables predefinidas del sistema
INSERT INTO template_variables (name, label, type, required, description) VALUES 
  ('cliente_nombre', 'Nombre del Cliente', 'text', true, 'Nombre completo del cliente o empresa'),
  ('cliente_email', 'Email del Cliente', 'text', true, 'Dirección de correo electrónico del cliente'),
  ('cliente_telefono', 'Teléfono del Cliente', 'text', false, 'Número de teléfono de contacto'),
  ('cliente_cedula', 'Cédula/NIT del Cliente', 'text', true, 'Documento de identidad o NIT'),
  ('fecha_inicio', 'Fecha de Inicio', 'date', true, 'Fecha de inicio del contrato'),
  ('fecha_fin', 'Fecha de Finalización', 'date', false, 'Fecha de finalización del contrato'),
  ('valor_contrato', 'Valor del Contrato', 'number', true, 'Valor monetario del contrato'),
  ('duracion_meses', 'Duración en Meses', 'number', false, 'Duración del contrato en meses'),
  ('descripcion_servicios', 'Descripción de Servicios', 'textarea', true, 'Descripción detallada de los servicios a prestar'),
  ('forma_pago', 'Forma de Pago', 'select', false, 'Modalidad de pago acordada')
ON CONFLICT (name) DO NOTHING;

-- Actualizar opciones para la variable forma_pago
UPDATE template_variables 
SET options = ARRAY['Mensual', 'Quincenal', 'Por hitos', 'Al finalizar', 'Mixto']
WHERE name = 'forma_pago';

-- Insertar plantilla de ejemplo
INSERT INTO contract_templates (title, description, category, content, variables, status) VALUES 
(
  'Contrato de Servicios Profesionales',
  'Plantilla básica para contratos de servicios profesionales',
  'servicios',
  'CONTRATO DE PRESTACIÓN DE SERVICIOS PROFESIONALES

Entre {{cliente_nombre}}, identificado con cédula/NIT {{cliente_cedula}}, con domicilio en [CIUDAD], teléfono {{cliente_telefono}} y correo electrónico {{cliente_email}}, quien en adelante se denominará EL CLIENTE, y [NOMBRE_EMPRESA], identificada con NIT [NIT_EMPRESA], quien en adelante se denominará EL CONTRATISTA, se celebra el presente contrato de prestación de servicios profesionales, el cual se regirá por las siguientes:

CLÁUSULAS

PRIMERA. OBJETO DEL CONTRATO
EL CONTRATISTA se compromete a prestar los siguientes servicios:
{{descripcion_servicios}}

SEGUNDA. PLAZO DE EJECUCIÓN
El presente contrato tendrá una duración desde el {{fecha_inicio}} hasta el {{fecha_fin}}, con una duración total de {{duracion_meses}} meses.

TERCERA. VALOR Y FORMA DE PAGO
El valor total del presente contrato es de ${{valor_contrato}} pesos colombianos.
La forma de pago será: {{forma_pago}}.

CUARTA. OBLIGACIONES DEL CONTRATISTA
- Ejecutar los servicios con la mejor calidad técnica y profesional
- Cumplir con los plazos establecidos
- Mantener confidencialidad sobre la información del cliente

QUINTA. OBLIGACIONES DEL CLIENTE
- Proporcionar la información necesaria para la ejecución de los servicios
- Realizar los pagos en las fechas acordadas
- Colaborar en el desarrollo de las actividades

En constancia de lo anterior, las partes firman el presente contrato en [CIUDAD] a los [DÍA] días del mes de [MES] de [AÑO].

_____________________                    _____________________
EL CLIENTE                               EL CONTRATISTA
{{cliente_nombre}}                       [NOMBRE_EMPRESA]
C.C./NIT {{cliente_cedula}}              NIT [NIT_EMPRESA]',
  ARRAY['cliente_nombre', 'cliente_cedula', 'cliente_telefono', 'cliente_email', 'descripcion_servicios', 'fecha_inicio', 'fecha_fin', 'duracion_meses', 'valor_contrato', 'forma_pago'],
  'active'
)
ON CONFLICT DO NOTHING;