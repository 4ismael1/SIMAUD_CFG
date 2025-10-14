/*
  # Permitir a administradores editar usuarios

  1. Nueva Política RLS
    - Permite a administradores y supervisores actualizar cualquier perfil de usuario
  
  2. Permisos
    - Administradores pueden editar cualquier usuario
    - Supervisores pueden editar cualquier usuario
    - Usuarios normales solo pueden editar su propio perfil
*/

-- Agregar política para que admins y supervisores puedan actualizar cualquier perfil
CREATE POLICY "Admins and supervisors can update all profiles"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_supervisor(auth.uid()))
  WITH CHECK (is_admin_or_supervisor(auth.uid()));