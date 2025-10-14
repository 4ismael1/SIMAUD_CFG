/*
  # Arreglar ejecución del trigger para user_profiles

  1. Triggers
    - Eliminar cualquier trigger existente
    - Crear trigger correctamente configurado
    - Asegurar que se ejecute DESPUÉS del INSERT en auth.users

  2. Function
    - Función robusta que maneja metadata correctamente
    - Manejo de errores que no bloquea la creación del usuario
    - Logs para debugging
*/

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;

-- Drop and recreate the function
DROP FUNCTION IF EXISTS handle_new_user();

-- Create the function with proper error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into user_profiles with data from auth metadata
  INSERT INTO public.user_profiles (id, email, name, phone, cedula, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')::user_role
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Error creating user profile for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();