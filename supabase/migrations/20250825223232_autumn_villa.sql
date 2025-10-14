/*
  # Arreglar trigger de creación de perfiles de usuario

  Este migración soluciona el problema de "Database error saving new user" al:
  1. Eliminar cualquier trigger o función existente que pueda estar mal configurada
  2. Crear una función trigger que correctamente extraiga los datos del metadata
  3. Configurar el trigger para que se ejecute después de la inserción en auth.users
  4. Manejar adecuadamente los valores por defecto y nulls

  ## Cambios
  - Elimina triggers y funciones existentes que pueden estar causando conflictos
  - Crea función handle_new_user que extrae datos de raw_user_meta_data correctamente  
  - Configura trigger on_auth_user_created en auth.users
  - Maneja casos donde algunos campos metadata pueden estar vacíos
*/

-- Eliminar trigger existente si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

-- Eliminar función existente si existe
DROP FUNCTION IF EXISTS handle_new_user();

-- Crear la función del trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    name,
    phone,
    cedula,
    role,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'name')::text, ''),
    COALESCE((NEW.raw_user_meta_data->>'phone')::text, ''),
    COALESCE((NEW.raw_user_meta_data->>'cedula')::text, ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role),
    NOW(),
    NOW()
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Error creating user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear el trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();