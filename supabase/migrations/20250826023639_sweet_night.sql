/*
  # Permitir acceso de administradores a todos los usuarios

  1. Nueva función
    - Función para verificar si el usuario actual es admin sin recursión
    - Usa una verificación directa con el user_id

  2. Nueva política RLS  
    - Permite a administradores y supervisores leer todos los perfiles
    - Usa la función para evitar recursión infinita
*/

-- Crear función para verificar roles de admin/supervisor sin recursión
CREATE OR REPLACE FUNCTION is_admin_or_supervisor(user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = user_id 
    AND role IN ('admin', 'supervisor')
  );
END;
$$;

-- Crear política que permite a admins y supervisores ver todos los perfiles
CREATE POLICY "Admins and supervisors can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));