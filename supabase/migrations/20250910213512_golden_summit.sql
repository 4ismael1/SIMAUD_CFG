/*
  # Eliminar y recrear función de estadísticas de firmantes

  1. Cambios
    - Elimina la función existente get_signatory_contracts_stats
    - Recrea la función con permisos correctos y usando user_profiles
    - Corrige políticas RLS para usar user_profiles en lugar de users
    
  2. Seguridad
    - Función con SECURITY DEFINER para privilegios elevados
    - search_path fijo para evitar inyección de SQL
    - Políticas actualizadas para usar user_profiles
*/

-- Eliminar función existente
DROP FUNCTION IF EXISTS get_signatory_contracts_stats(uuid);

-- Recrear función con permisos correctos
CREATE OR REPLACE FUNCTION get_signatory_contracts_stats(user_uuid uuid)
RETURNS TABLE (
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
        COALESCE(SUM(CASE WHEN cs.status = 'pending' THEN 1 ELSE 0 END), 0) as pending_signature,
        COALESCE(SUM(CASE WHEN cs.status = 'signed' THEN 1 ELSE 0 END), 0) as signed,
        COALESCE(SUM(CASE WHEN cs.status = 'signed' AND c.status = 'active' AND (c.end_date IS NULL OR c.end_date >= CURRENT_DATE) THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN cs.status = 'signed' AND c.end_date < CURRENT_DATE THEN 1 ELSE 0 END), 0) as expired
    FROM contract_signatories cs
    JOIN contracts c ON c.id = cs.contract_id
    LEFT JOIN user_profiles up ON up.id = user_uuid
    WHERE c.approval_status = 'approved'
    AND (cs.user_id = user_uuid OR cs.email = up.email);
END;
$$;

-- Otorgar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION get_signatory_contracts_stats(uuid) TO authenticated;

-- Actualizar políticas RLS para usar user_profiles en lugar de users
ALTER POLICY "Signatories can update their signing status" ON contract_signatories 
USING (
    (user_id = auth.uid() OR email = (
        SELECT email FROM user_profiles WHERE id = auth.uid()
    )) AND (
        EXISTS (
            SELECT 1 FROM contracts c 
            WHERE c.id = contract_signatories.contract_id 
            AND c.approval_status = 'approved'
        )
    )
)
WITH CHECK (
    (user_id = auth.uid() OR email = (
        SELECT email FROM user_profiles WHERE id = auth.uid()
    )) AND (
        EXISTS (
            SELECT 1 FROM contracts c 
            WHERE c.id = contract_signatories.contract_id 
            AND c.approval_status = 'approved'
        )
    )
);

ALTER POLICY "Signatories can view their own signing info" ON contract_signatories 
USING (
    user_id = auth.uid() OR 
    email = (SELECT email FROM user_profiles WHERE id = auth.uid()) OR 
    (EXISTS (
        SELECT 1 FROM contracts c 
        WHERE c.id = contract_signatories.contract_id 
        AND c.approval_status = 'approved'
    ))
);