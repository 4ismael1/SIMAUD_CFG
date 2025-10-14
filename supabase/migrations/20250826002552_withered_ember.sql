/*
  # Agregar foto de perfil a usuarios

  1. Cambios
    - Agregar columna `avatar_url` a la tabla `user_profiles`
    - Crear bucket de storage para avatares
    - Configurar políticas de acceso para el storage

  2. Seguridad
    - Los usuarios pueden subir/actualizar su propio avatar
    - Los avatares son públicos para lectura
*/

-- Agregar columna avatar_url a user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS avatar_url text;

-- Crear bucket para avatares (solo si no existe)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars', 
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Política para permitir a los usuarios subir sus propios avatares
CREATE POLICY "Users can upload their own avatar" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir a los usuarios actualizar sus propios avatares
CREATE POLICY "Users can update their own avatar" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir a los usuarios eliminar sus propios avatares
CREATE POLICY "Users can delete their own avatar" ON storage.objects
FOR DELETE USING (
  bucket_id = 'avatars' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Política para permitir lectura pública de avatares
CREATE POLICY "Avatars are publicly accessible" ON storage.objects
FOR SELECT USING (bucket_id = 'avatars');