/*
# Arreglar acceso a contratos para firmantes

Este archivo corrige los permisos y políticas para que los firmantes puedan ver
sus contratos aprobados en el dashboard.

## Problemas identificados:
1. Políticas RLS muy restrictivas para firmantes
2. Vinculación de user_id no automática
3. Contratos aprobados no visibles

## Soluciones aplicadas:
1. Políticas RLS mejoradas para firmantes
2. Función para vincular firmantes automáticamente
3. Consulta SQL optimizada
*/

-- Primero, verificar y arreglar las políticas de contract_signatories
DROP POLICY IF EXISTS "Signatories can view their own signing info" ON contract_signatories;
CREATE POLICY "Signatories can view their own signing info"
ON contract_signatories FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() 
  OR email = (SELECT email FROM user_profiles WHERE id = auth.uid())
  OR (
    EXISTS (
      SELECT 1 FROM contracts c 
      WHERE c.id = contract_signatories.contract_id 
      AND c.approval_status IN ('approved', 'signed', 'completed')
    )
    AND (
      user_id = auth.uid() 
      OR email = (SELECT email FROM user_profiles WHERE id = auth.uid())
    )
  )
);

-- Asegurar que los firmantes puedan ver contratos aprobados
DROP POLICY IF EXISTS "Signatories can read approved contracts" ON contracts;
CREATE POLICY "Signatories can read approved contracts"
ON contracts FOR SELECT
TO authenticated
USING (
  approval_status IN ('approved', 'signed', 'completed')
  AND (
    -- Si el usuario es firmante de este contrato
    EXISTS (
      SELECT 1 FROM contract_signatories cs
      WHERE cs.contract_id = contracts.id
      AND (
        cs.user_id = auth.uid() 
        OR cs.email = (SELECT email FROM user_profiles WHERE id = auth.uid())
      )
    )
    -- O si es el creador, admin o supervisor
    OR created_by = auth.uid()
    OR is_admin_or_supervisor(auth.uid())
  )
);

-- Función para vincular firmantes existentes con usuarios por email
CREATE OR REPLACE FUNCTION public.link_existing_signatories_for_user(target_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
  linked_count integer := 0;
BEGIN
  -- Obtener email del usuario
  SELECT email INTO user_email 
  FROM user_profiles 
  WHERE id = target_user_id;
  
  IF user_email IS NOT NULL THEN
    -- Actualizar firmantes que coincidan por email pero no tengan user_id
    UPDATE contract_signatories 
    SET user_id = target_user_id
    WHERE email = user_email 
      AND user_id IS NULL;
    
    GET DIAGNOSTICS linked_count = ROW_COUNT;
  END IF;
  
  RETURN linked_count;
END;
$$;

-- Función para obtener contratos de un firmante con información completa
CREATE OR REPLACE FUNCTION public.get_signatory_contracts(target_user_id uuid)
RETURNS TABLE (
  contract_id uuid,
  contract_title text,
  contract_client_name text,
  contract_status text,
  contract_approval_status text,
  contract_value numeric,
  contract_start_date date,
  contract_end_date date,
  contract_created_at timestamptz,
  signatory_id uuid,
  signatory_name text,
  signatory_email text,
  signatory_role text,
  signatory_status text,
  signatory_signing_order integer,
  signatory_signed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  -- Obtener email del usuario
  SELECT email INTO user_email 
  FROM user_profiles 
  WHERE id = target_user_id;
  
  -- Primero vincular firmantes existentes
  PERFORM link_existing_signatories_for_user(target_user_id);
  
  -- Retornar contratos donde el usuario es firmante
  RETURN QUERY
  SELECT 
    c.id as contract_id,
    c.title as contract_title,
    c.client_name as contract_client_name,
    c.status as contract_status,
    c.approval_status as contract_approval_status,
    c.contract_value,
    c.start_date as contract_start_date,
    c.end_date as contract_end_date,
    c.created_at as contract_created_at,
    cs.id as signatory_id,
    cs.name as signatory_name,
    cs.email as signatory_email,
    cs.role as signatory_role,
    cs.status as signatory_status,
    cs.signing_order as signatory_signing_order,
    cs.signed_at as signatory_signed_at
  FROM contract_signatories cs
  JOIN contracts c ON c.id = cs.contract_id
  WHERE (cs.user_id = target_user_id OR cs.email = user_email)
    AND c.approval_status IN ('approved', 'signed', 'completed')
  ORDER BY c.created_at DESC, cs.signing_order ASC;
END;
$$;

-- Conceder permisos necesarios
GRANT EXECUTE ON FUNCTION public.link_existing_signatories_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_signatory_contracts(uuid) TO authenticated;

-- Migrar datos existentes: vincular firmantes por email
DO $$
DECLARE
  user_record RECORD;
  linked_count integer;
BEGIN
  FOR user_record IN 
    SELECT id, email FROM user_profiles
  LOOP
    -- Vincular firmantes para cada usuario
    UPDATE contract_signatories 
    SET user_id = user_record.id
    WHERE email = user_record.email 
      AND user_id IS NULL;
    
    GET DIAGNOSTICS linked_count = ROW_COUNT;
    
    IF linked_count > 0 THEN
      RAISE NOTICE 'Vinculados % firmantes para usuario %', linked_count, user_record.email;
    END IF;
  END LOOP;
END;
$$;