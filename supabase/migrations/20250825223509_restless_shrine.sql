/*
  # Reordenar columnas de user_profiles y arreglar trigger

  1. Reordena las columnas en un orden más lógico:
     - id (identificador principal)
     - email (identificación única)
     - name, phone, cedula (datos personales)
     - role (rol del usuario) 
     - created_at, updated_at (metadatos temporales)

  2. Recrea el trigger para asegurar compatibilidad
*/

-- Crear nueva tabla con el orden correcto
CREATE TABLE IF NOT EXISTS user_profiles_new (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  cedula text UNIQUE NOT NULL,
  role user_role DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Copiar datos existentes si los hay
INSERT INTO user_profiles_new (id, email, name, phone, cedula, role, created_at, updated_at)
SELECT id, email, name, phone, cedula, role, created_at, updated_at 
FROM user_profiles;

-- Eliminar tabla antigua
DROP TABLE user_profiles;

-- Renombrar tabla nueva
ALTER TABLE user_profiles_new RENAME TO user_profiles;

-- Recrear índices
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_email_key ON user_profiles(email);
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_cedula_key ON user_profiles(cedula);

-- Habilitar RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Recrear políticas RLS
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

CREATE POLICY "Allow profile creation during signup"
  ON user_profiles
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read all profiles"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_profiles up 
    WHERE up.id = auth.uid() AND up.role = 'admin'
  ));

-- Recrear trigger de updated_at
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Eliminar trigger anterior si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Crear función del trigger mejorada
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')::user_role
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log el error pero no fallar la creación del usuario
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();