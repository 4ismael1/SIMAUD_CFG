/*
  # Fix user profile creation trigger

  1. Problems Fixed
    - Users registering but profile not created in user_profiles table
    - Trigger not handling user metadata correctly
    - Profile creation failing silently

  2. Solution
    - Recreate trigger function to handle user registration
    - Extract metadata properly (name, phone, cedula, role)
    - Create profile automatically when user confirms email
    - Handle edge cases and errors properly
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Create improved function to handle new user profile creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  user_phone TEXT;  
  user_cedula TEXT;
  user_role user_role;
BEGIN
  -- Extract data from user metadata, with fallbacks
  user_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);
  user_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  user_cedula := COALESCE(NEW.raw_user_meta_data->>'cedula', '');
  user_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role);

  -- Only create profile when email is confirmed
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    INSERT INTO user_profiles (
      id,
      email,
      name,
      phone,
      cedula,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      user_name,
      user_phone,
      user_cedula,
      user_role,
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires on user updates (when email gets confirmed)
CREATE TRIGGER on_auth_user_created
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Also handle immediate profile creation for users created with confirmed email (like admin-created users)
CREATE OR REPLACE FUNCTION handle_immediate_user()
RETURNS TRIGGER AS $$
DECLARE
  user_name TEXT;
  user_phone TEXT;  
  user_cedula TEXT;
  user_role user_role;
BEGIN
  -- Only for users with confirmed email from the start
  IF NEW.email_confirmed_at IS NOT NULL THEN
    user_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.email);
    user_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
    user_cedula := COALESCE(NEW.raw_user_meta_data->>'cedula', '');
    user_role := COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role);

    INSERT INTO user_profiles (
      id,
      email,
      name,
      phone,
      cedula,
      role,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      NEW.email,
      user_name,
      user_phone,
      user_cedula,
      user_role,
      NOW(),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for immediate profile creation
CREATE TRIGGER on_auth_user_created_immediate
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_immediate_user();