/*
# Política RLS para administradores

1. Nueva política
   - Permite a usuarios con role 'admin' leer todos los perfiles de usuarios
   - Se agrega a las políticas existentes de la tabla user_profiles

2. Seguridad
   - Solo usuarios autenticados con role 'admin' pueden acceder
   - Mantiene la seguridad para usuarios regulares
*/

-- Crear política para que administradores puedan leer todos los perfiles
CREATE POLICY "Admins can read all user profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );