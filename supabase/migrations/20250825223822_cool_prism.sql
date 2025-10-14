/*
# Forzar creación de trigger que funcione

1. Elimina cualquier trigger existente
2. Crea función simple y directa
3. Crea trigger en auth.users que SÍ funcione
4. Manejo de errores mejorado
*/

-- Eliminar todo lo existente
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Crear función que SÍ funcione
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insertar directamente sin validaciones complejas
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
    COALESCE(NEW.raw_user_meta_data->>'name', 'Usuario'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role)
  );
  
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log el error pero continúa
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Crear trigger que SÍ se ejecute
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Verificar que existe
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';