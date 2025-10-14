/*
  # Recrear tabla user_profiles completa con trigger funcionando

  1. Nueva tabla user_profiles
    - `id` (uuid, primary key, foreign key to auth.users)
    - `email` (text, unique, not null)
    - `name` (text, not null) 
    - `phone` (text, not null)
    - `cedula` (text, unique, not null)
    - `role` (user_role enum, default 'user')
    - `created_at` (timestamp)
    - `updated_at` (timestamp)

  2. Seguridad RLS
    - Políticas para usuarios y admins
    - Trigger para updated_at

  3. Trigger para crear perfil automáticamente
*/

-- Crear enum si no existe
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Crear función para manejar updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear la tabla user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  cedula text UNIQUE NOT NULL,
  role user_role DEFAULT 'user'::user_role,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can read own profile"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up
    WHERE up.id = auth.uid() AND up.role = 'admin'::user_role
  ));

CREATE POLICY "Allow profile creation during signup"
  ON user_profiles
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS handle_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER handle_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Función para crear perfil cuando se registra usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    name,
    phone,
    cedula,
    role
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role)
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't prevent user creation
    RAISE WARNING 'Could not create user profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();