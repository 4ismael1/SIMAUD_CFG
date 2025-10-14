/*
  # Contract Renewals and Notifications System

  1. New Tables
    - `contract_renewals`: Track renewal requests and processing
    - `notifications`: In-app notification system
    - `contract_cancellations`: Track contract cancellations with reasons
    
  2. Contract Updates
    - Add auto_renewal field for automatic renewals
    - Add parent_contract_id for tracking renewal chains
    - Add renewal_type field to distinguish renewal types
    - Expand status enum to include new states

  3. Security
    - Enable RLS on all new tables
    - Add appropriate policies for each role
    - Maintain data isolation per user/role

  4. Functions
    - Trigger function for automatic status updates
    - Function to check contract expiry
    - Function to generate notifications
*/

-- Add new fields to contracts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'auto_renewal'
  ) THEN
    ALTER TABLE contracts ADD COLUMN auto_renewal boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'parent_contract_id'
  ) THEN
    ALTER TABLE contracts ADD COLUMN parent_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'renewal_type'
  ) THEN
    ALTER TABLE contracts ADD COLUMN renewal_type text CHECK (renewal_type IN ('original', 'manual_renewal', 'auto_renewal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'actual_status'
  ) THEN
    ALTER TABLE contracts ADD COLUMN actual_status text DEFAULT 'draft';
  END IF;
END $$;

-- Create contract renewals table
CREATE TABLE IF NOT EXISTS contract_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  requested_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'cancelled')),
  proposed_changes jsonb DEFAULT '{}',
  proposed_start_date date,
  proposed_end_date date,
  proposed_value numeric(15,2),
  gestor_response text,
  processed_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  processed_at timestamptz,
  new_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL,
  escalated_at timestamptz,
  escalated_to uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  escalation_reason text,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  auto_renewal boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('contract_expiring', 'renewal_request', 'approval_needed', 'contract_signed', 'contract_cancelled', 'renewal_approved', 'renewal_rejected')),
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}',
  read_at timestamptz,
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  expires_at timestamptz,
  action_url text,
  action_label text,
  created_at timestamptz DEFAULT now()
);

-- Create contract cancellations table
CREATE TABLE IF NOT EXISTS contract_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  cancelled_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  cancelled_at timestamptz DEFAULT now(),
  reason text NOT NULL CHECK (reason IN ('breach', 'mutual_agreement', 'client_request', 'payment_default', 'other')),
  description text,
  approved_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE contract_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_cancellations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contract_renewals
CREATE POLICY "Users can view renewals of their contracts"
  ON contract_renewals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_renewals.original_contract_id 
      AND contracts.created_by = auth.uid()
    )
    OR 
    EXISTS (
      SELECT 1 FROM contract_signatories 
      WHERE contract_signatories.contract_id = contract_renewals.original_contract_id 
      AND contract_signatories.user_id = auth.uid()
    )
    OR
    requested_by = auth.uid()
  );

CREATE POLICY "Gestores can manage renewals of their contracts"
  ON contract_renewals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_renewals.original_contract_id 
      AND contracts.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_renewals.original_contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and supervisors can view all renewals"
  ON contract_renewals FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Service role full access renewals"
  ON contract_renewals FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for notifications
CREATE POLICY "Users can only see their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role full access notifications"
  ON notifications FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for contract_cancellations
CREATE POLICY "Users can view cancellations of their contracts"
  ON contract_cancellations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_cancellations.contract_id 
      AND contracts.created_by = auth.uid()
    )
    OR 
    cancelled_by = auth.uid()
  );

CREATE POLICY "Gestores can manage cancellations of their contracts"
  ON contract_cancellations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM contracts 
      WHERE contracts.id = contract_cancellations.contract_id 
      AND contracts.created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and supervisors can manage all cancellations"
  ON contract_cancellations FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.role IN ('admin', 'supervisor')
    )
  );

CREATE POLICY "Service role full access cancellations"
  ON contract_cancellations FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contract_renewals_original_contract ON contract_renewals(original_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_renewals_status ON contract_renewals(status);
CREATE INDEX IF NOT EXISTS idx_contract_renewals_requested_by ON contract_renewals(requested_by);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

CREATE INDEX IF NOT EXISTS idx_contract_cancellations_contract_id ON contract_cancellations(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_cancellations_status ON contract_cancellations(status);

CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_auto_renewal ON contracts(auto_renewal);
CREATE INDEX IF NOT EXISTS idx_contracts_parent_contract ON contracts(parent_contract_id);

-- Trigger for updating updated_at timestamps
CREATE OR REPLACE FUNCTION handle_renewals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER handle_contract_renewals_updated_at
  BEFORE UPDATE ON contract_renewals
  FOR EACH ROW EXECUTE FUNCTION handle_renewals_updated_at();

-- Function to update contract status based on dates
CREATE OR REPLACE FUNCTION update_contract_status_by_date()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update contracts to expiring_soon (30 days before end_date)
  UPDATE contracts 
  SET actual_status = 'expiring_soon'
  WHERE end_date IS NOT NULL 
    AND end_date - CURRENT_DATE <= 30
    AND end_date - CURRENT_DATE > 0
    AND approval_status = 'signed'
    AND actual_status NOT IN ('expiring_soon', 'expired', 'completed', 'cancelled');

  -- Update contracts to expired (past end_date)
  UPDATE contracts 
  SET actual_status = 'expired'
  WHERE end_date IS NOT NULL 
    AND end_date < CURRENT_DATE
    AND approval_status = 'signed'
    AND actual_status NOT IN ('expired', 'completed', 'cancelled');

  -- Handle auto-renewals for expired contracts
  INSERT INTO contract_renewals (
    original_contract_id,
    requested_by,
    status,
    auto_renewal,
    proposed_start_date,
    proposed_end_date,
    proposed_value,
    proposed_changes
  )
  SELECT 
    c.id,
    c.created_by,
    'pending',
    true,
    c.end_date + INTERVAL '1 day',
    c.end_date + INTERVAL '1 year', -- Default 1 year extension
    c.contract_value,
    '{"auto_generated": true, "renewal_reason": "Automatic renewal triggered"}'::jsonb
  FROM contracts c
  WHERE c.auto_renewal = true
    AND c.end_date < CURRENT_DATE
    AND c.actual_status = 'expired'
    AND NOT EXISTS (
      SELECT 1 FROM contract_renewals cr 
      WHERE cr.original_contract_id = c.id 
      AND cr.auto_renewal = true
    );
END;
$$;