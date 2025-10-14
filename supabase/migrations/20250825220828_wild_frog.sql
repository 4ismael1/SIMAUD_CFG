/*
  # Seed admin user for SIMAUD

  1. Purpose
    - Create initial admin user for system access
    - This is for development/testing purposes
    - Email: admin@simaud.com
    - Role: admin

  2. Security
    - Uses Supabase auth system
    - Profile created automatically via trigger
*/

-- Insert admin user (this will be handled by Supabase Auth in the application)
-- This migration serves as documentation for the admin user creation process