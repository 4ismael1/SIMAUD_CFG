/*
  # Fix Foreign Key Relationships

  1. Foreign Key Corrections
    - Update contract_approvals foreign keys to reference user_profiles
    - Update contract_versions foreign keys to reference user_profiles
    - Ensure proper relationships for Supabase joins

  2. Schema Updates
    - Drop existing foreign keys pointing to users table
    - Create new foreign keys pointing to user_profiles table
    - Maintain referential integrity
*/

-- Fix contract_approvals foreign keys
ALTER TABLE contract_approvals 
DROP CONSTRAINT IF EXISTS contract_approvals_requested_by_fkey;

ALTER TABLE contract_approvals 
DROP CONSTRAINT IF EXISTS contract_approvals_reviewed_by_fkey;

-- Add correct foreign keys to user_profiles
ALTER TABLE contract_approvals 
ADD CONSTRAINT contract_approvals_requested_by_fkey 
FOREIGN KEY (requested_by) REFERENCES user_profiles(id) ON DELETE SET NULL;

ALTER TABLE contract_approvals 
ADD CONSTRAINT contract_approvals_reviewed_by_fkey 
FOREIGN KEY (reviewed_by) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Fix contract_versions foreign keys
ALTER TABLE contract_versions 
DROP CONSTRAINT IF EXISTS contract_versions_created_by_fkey;

ALTER TABLE contract_versions 
ADD CONSTRAINT contract_versions_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;