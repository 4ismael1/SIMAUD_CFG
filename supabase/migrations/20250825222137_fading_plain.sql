/*
  # Agregar campo email a user_profiles

  1. Cambios en la tabla
    - Agregar columna `email` (text, unique, not null)
  
  2. Actualizar trigger
    - Modificar la función para insertar el email correctamente
*/

-- Agregar columna email a la tabla user_profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN email text UNIQUE NOT NULL;
  END IF;
END $$;

-- Recrear la función del trigger con el campo email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, name, phone, cedula, role)
  VALUES (
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
    -- Log error but don't prevent user creation
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY definer;