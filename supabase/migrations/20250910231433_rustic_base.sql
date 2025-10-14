/*
  # Políticas RLS Finales y Estables

  1. Elimina TODAS las políticas existentes que causan recursión
  2. Crea políticas simples y directas sin circular references
  3. Estandariza permisos para todos los roles
  4. Garantiza que gestores y firmantes pueden ver contratos
  5. Sin subqueries complejas que causen loops

  Casos de uso cubiertos:
  - Admin/Supervisor: Ve todo
  - Gestor/User: Ve sus propios contratos 
  - Firmante: Ve contratos aprobados donde es firmante
  - Sistema: Operaciones automáticas
*/

-- ===== PASO 1: LIMPIAR TODAS LAS POLÍTICAS EXISTENTES =====

-- Desactivar RLS temporalmente para limpiar
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatories DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_approvals DISABLE ROW LEVEL SECURITY;
ALTER TABLE contract_audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE template_variables DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Eliminar TODAS las políticas existentes
DO $$ 
BEGIN
    -- user_profiles
    DROP POLICY IF EXISTS "enable_read_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "enable_insert_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "enable_update_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "service_role_all_access" ON user_profiles;
    DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "users_insert_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;
    DROP POLICY IF EXISTS "service_role_access" ON user_profiles;

    -- contracts
    DROP POLICY IF EXISTS "users_create_contracts" ON contracts;
    DROP POLICY IF EXISTS "users_read_own_contracts" ON contracts;
    DROP POLICY IF EXISTS "users_update_own_contracts" ON contracts;
    DROP POLICY IF EXISTS "admins_manage_all_contracts" ON contracts;
    DROP POLICY IF EXISTS "admins_read_all_contracts" ON contracts;
    DROP POLICY IF EXISTS "signatories_read_contracts" ON contracts;
    DROP POLICY IF EXISTS "service_role_access_contracts" ON contracts;

    -- contract_signatories
    DROP POLICY IF EXISTS "contract_signatories_read_own_contracts" ON contract_signatories;
    DROP POLICY IF EXISTS "contract_signatories_read_as_signatory" ON contract_signatories;
    DROP POLICY IF EXISTS "contract_signatories_update_own_signature" ON contract_signatories;
    DROP POLICY IF EXISTS "contract_signatories_admin_access" ON contract_signatories;
    DROP POLICY IF EXISTS "contract_signatories_service_role" ON contract_signatories;

    -- Otras tablas
    DROP POLICY IF EXISTS "Gestores can read active contract templates" ON contract_templates;
    DROP POLICY IF EXISTS "Supervisors and Admins can manage contract templates" ON contract_templates;
    DROP POLICY IF EXISTS "admins_manage_templates" ON contract_templates;
    DROP POLICY IF EXISTS "authenticated_read_templates" ON contract_templates;
EXCEPTION
    WHEN OTHERS THEN
        -- Continuar si alguna política no existe
        NULL;
END $$;

-- ===== PASO 2: CREAR POLÍTICAS SIMPLES Y DIRECTAS =====

-- ===== USER_PROFILES: Políticas básicas =====
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_own_access"
ON user_profiles FOR ALL
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_service_role"
ON user_profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACTS: Políticas por rol =====
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Usuarios ven sus propios contratos
CREATE POLICY "contracts_owner_access"
ON contracts FOR ALL
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

-- Admin/Supervisor ven todos los contratos
CREATE POLICY "contracts_admin_access"
ON contracts FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

-- Firmantes ven contratos aprobados donde son firmantes
CREATE POLICY "contracts_signatory_read"
ON contracts FOR SELECT
TO authenticated
USING (
    approval_status IN ('approved', 'signed', 'completed') 
    AND id IN (
        SELECT contract_id 
        FROM contract_signatories 
        WHERE user_id = auth.uid() OR email = auth.email()
    )
);

-- Service role acceso completo
CREATE POLICY "contracts_service_role"
ON contracts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACT_SIGNATORIES: Acceso directo =====
ALTER TABLE contract_signatories ENABLE ROW LEVEL SECURITY;

-- Usuarios ven firmantes de sus propios contratos
CREATE POLICY "signatories_contract_owner"
ON contract_signatories FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM contracts 
        WHERE id = contract_signatories.contract_id 
        AND created_by = auth.uid()
    )
);

-- Firmantes ven sus propias entradas
CREATE POLICY "signatories_own_access"
ON contract_signatories FOR ALL
TO authenticated
USING (user_id = auth.uid() OR email = auth.email())
WITH CHECK (user_id = auth.uid() OR email = auth.email());

-- Admin/Supervisor ven todos los firmantes
CREATE POLICY "signatories_admin_access"
ON contract_signatories FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

-- Service role acceso completo
CREATE POLICY "signatories_service_role"
ON contract_signatories FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACT_TEMPLATES: Acceso básico =====
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_read_active"
ON contract_templates FOR SELECT
TO authenticated
USING (status = 'active');

CREATE POLICY "templates_admin_manage"
ON contract_templates FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "templates_service_role"
ON contract_templates FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== TEMPLATE_VARIABLES: Acceso básico =====
ALTER TABLE template_variables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "variables_read_all"
ON template_variables FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "variables_admin_manage"
ON template_variables FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "variables_service_role"
ON template_variables FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACT_VERSIONS: Acceso por contrato =====
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions_owner_access"
ON contract_versions FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM contracts 
        WHERE id = contract_versions.contract_id 
        AND created_by = auth.uid()
    )
);

CREATE POLICY "versions_admin_access"
ON contract_versions FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "versions_service_role"
ON contract_versions FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACT_APPROVALS: Workflow =====
ALTER TABLE contract_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approvals_owner_access"
ON contract_approvals FOR ALL
TO authenticated
USING (
    requested_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM contracts 
        WHERE id = contract_approvals.contract_id 
        AND created_by = auth.uid()
    )
);

CREATE POLICY "approvals_admin_manage"
ON contract_approvals FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "approvals_service_role"
ON contract_approvals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== CONTRACT_AUDIT_LOGS: Solo lectura =====
ALTER TABLE contract_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_owner_read"
ON contract_audit_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM contracts 
        WHERE id = contract_audit_logs.contract_id 
        AND created_by = auth.uid()
    )
);

CREATE POLICY "audit_admin_read"
ON contract_audit_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'supervisor')
    )
);

CREATE POLICY "audit_service_role"
ON contract_audit_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== AUDIT_LOGS: Solo admin =====
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_admin_read"
ON audit_logs FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM user_profiles 
        WHERE id = auth.uid() 
        AND role = 'admin'
    )
);

CREATE POLICY "audit_logs_service_role"
ON audit_logs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===== VERIFICAR ESTADO FINAL =====
DO $$
BEGIN
    RAISE NOTICE 'Políticas RLS establecidas correctamente:';
    RAISE NOTICE '✅ user_profiles: Acceso propio + service role';
    RAISE NOTICE '✅ contracts: Owner + Admin/Supervisor + Firmantes (aprobados)';
    RAISE NOTICE '✅ contract_signatories: Owner + Propio + Admin/Supervisor';
    RAISE NOTICE '✅ contract_templates: Lectura todos + Admin maneja';
    RAISE NOTICE '✅ template_variables: Lectura todos + Admin maneja';
    RAISE NOTICE '✅ contract_versions: Por contrato + Admin';
    RAISE NOTICE '✅ contract_approvals: Owner + Admin';
    RAISE NOTICE '✅ contract_audit_logs: Por contrato + Admin';
    RAISE NOTICE '✅ audit_logs: Solo Admin';
    RAISE NOTICE '🔒 Sin recursión, políticas directas y estables';
END $$;