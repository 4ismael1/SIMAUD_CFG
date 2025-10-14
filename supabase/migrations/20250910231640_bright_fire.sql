/*
  # Fix infinite recursion in contracts RLS policies

  1. Problem
    - Infinite recursion detected in policy for relation "contracts"
    - Circular dependencies in RLS policies causing loops
    - Complex subqueries causing policy reevaluation

  2. Solution  
    - Drop ALL existing problematic policies
    - Create simple, direct policies without recursion
    - Use only auth.uid() comparisons, no subqueries
    - Separate policies for different access patterns

  3. Access Patterns
    - Users can access their own contracts (created_by = auth.uid())
    - Service role has full access for system operations
    - No complex role checking that could cause recursion
*/

-- Drop all existing policies that could cause recursion
DROP POLICY IF EXISTS "contracts_owner_access" ON contracts;
DROP POLICY IF EXISTS "contracts_admin_access" ON contracts;
DROP POLICY IF EXISTS "contracts_signatory_read" ON contracts;
DROP POLICY IF EXISTS "contracts_service_role" ON contracts;

-- Drop policies on related tables that might cause issues
DROP POLICY IF EXISTS "user_profiles_own_access" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_service_role" ON user_profiles;

-- Drop policies on contract_signatories that might cause recursion
DROP POLICY IF EXISTS "signatories_own_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_contract_owner" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_admin_access" ON contract_signatories;
DROP POLICY IF EXISTS "signatories_service_role" ON contract_signatories;

-- Create simple, non-recursive policies for user_profiles
CREATE POLICY "profiles_own_read" ON user_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON user_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_service" ON user_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create simple, non-recursive policies for contracts
CREATE POLICY "contracts_own_access" ON contracts
  FOR ALL
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "contracts_service" ON contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create simple, non-recursive policies for contract_signatories
CREATE POLICY "signatories_own" ON contract_signatories
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid() OR email = auth.email())
  WITH CHECK (user_id = auth.uid() OR email = auth.email());

CREATE POLICY "signatories_service" ON contract_signatories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create simple policies for contract_templates
DROP POLICY IF EXISTS "templates_read_active" ON contract_templates;
DROP POLICY IF EXISTS "templates_admin_manage" ON contract_templates;
DROP POLICY IF EXISTS "templates_service_role" ON contract_templates;

CREATE POLICY "templates_read" ON contract_templates
  FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "templates_service" ON contract_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);