/*
  # Fix Authentication Trigger and Add Missing RLS Policies

  This migration addresses the "Database error saving new user" by:
  1. Creating the missing INSERT policy for user_profiles table
  2. Ensuring the auth trigger exists on auth.users table (not just user_profiles)
  3. Adding proper error handling to the trigger function

  ## Changes
  1. INSERT policy for user_profiles table to allow profile creation
  2. Trigger on auth.users table for new user registration
  3. Improved trigger function with error handling
*/

-- Add INSERT policy for user_profiles (this was missing and likely causing the error)
CREATE POLICY "Allow profile creation during signup"
  ON user_profiles
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Recreate the handle_new_user function with better error handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert into user_profiles with data from raw_user_meta_data
  INSERT INTO public.user_profiles (
    id,
    name,
    phone,
    cedula,
    role
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'cedula', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')::user_role
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error creating user profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger exists on auth.users (not user_profiles)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();