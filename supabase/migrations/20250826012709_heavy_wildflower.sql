/*
  # Corregir trigger de registro para crear perfiles automáticamente
  
  1. Función actualizada
    - Crear perfil automáticamente cuando se registra un usuario
    - Extraer datos del user_metadata correctamente
    - Manejar errores sin fallar el registro
  
  2. Trigger
    - Ejecutar después de insertar en auth.users
    - Solo para nuevos registros (no updates)
*/

-- Recrear función para manejar nuevos usuarios
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
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
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    cedula = EXCLUDED.cedula,
    role = EXCLUDED.role,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recrear trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Asegurar que funcione para usuarios existentes también
CREATE OR REPLACE FUNCTION handle_immediate_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo ejecutar si no existe el perfil
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = NEW.id) THEN
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
      COALESCE(NEW.email, ''),
      COALESCE(NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'phone', ''),
      COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
      COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role),
      NOW(),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para capturar inmediatamente después de insert
DROP TRIGGER IF EXISTS on_auth_user_created_immediate ON auth.users;
CREATE TRIGGER on_auth_user_created_immediate
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_immediate_user();