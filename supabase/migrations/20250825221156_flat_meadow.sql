/*
  # Create user profile trigger function

  1. Functions
    - `handle_new_user()` - Automatically creates a user profile when a new user signs up
    - `handle_updated_at()` - Updates the updated_at timestamp on profile changes
  
  2. Triggers
    - Trigger on auth.users insert to create profile
    - Trigger on user_profiles update to update timestamp
  
  3. Security
    - Functions are security definer to allow profile creation
*/

-- Function to handle updated_at timestamp
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically create user profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
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
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'user'::user_role)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create trigger for profile updates  
DROP TRIGGER IF EXISTS handle_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER handle_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();