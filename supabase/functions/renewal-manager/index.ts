import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface RenewalRequest {
  original_contract_id: string;
  proposed_changes?: any;
  proposed_start_date?: string;
  proposed_end_date?: string;
  proposed_value?: number;
  auto_renewal?: boolean;
}

interface RenewalResponse {
  renewal_id: string;
  status: 'approved' | 'rejected';
  gestor_response?: string;
  processed_by: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'list';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get auth user from header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authorization');
    }

    let result: any = {};

    switch (action) {
      case 'list':
        result = await listRenewals(supabase, user.id, url.searchParams.get('status'));
        break;
      case 'create':
        const createData: RenewalRequest = await req.json();
        result = await createRenewal(supabase, user.id, createData);
        break;
      case 'process':
        const processData: RenewalResponse = await req.json();
        result = await processRenewal(supabase, user.id, processData);
        break;
      case 'escalate':
        const renewalId = url.searchParams.get('renewalId');
        if (!renewalId) throw new Error('Renewal ID required');
        result = await escalateRenewal(supabase, renewalId);
        break;
      default:
        throw new Error('Acción no válida');
    }

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error in renewal manager:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error en gestor de renovaciones',
      success: false
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

async function listRenewals(supabase: any, userId: string, statusFilter?: string) {
  try {
    // Get user role to determine what renewals they can see
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileError) throw profileError;

    let query = supabase
      .from('contract_renewals')
      .select(`
        *,
        original_contract:contracts!original_contract_id(
          id,
          title,
          client_name,
          client_email,
          contract_value,
          start_date,
          end_date,
          auto_renewal,
          created_by,
          creator:user_profiles!created_by(name, email)
        ),
        requester:user_profiles!requested_by(name, email),
        processor:user_profiles!processed_by(name, email),
        new_contract:contracts!new_contract_id(id, title, approval_status)
      `)
      .order('created_at', { ascending: false });

    // Apply role-based filtering
    if (userProfile.role === 'admin' || userProfile.role === 'supervisor') {
      // Can see all renewals
    } else {
      // Can only see renewals for their contracts or renewals they requested
      // We need to use two separate queries since we can't use nested columns in a single or() filter
      
      // First get renewals requested by this user
      const { data: requestedRenewals, error: requestedError } = await supabase
        .from('contract_renewals')
        .select(`
          *,
          original_contract:contracts!original_contract_id(
            id,
            title,
            client_name,
            client_email,
            contract_value,
            start_date,
            end_date,
            auto_renewal,
            created_by,
            creator:user_profiles!created_by(name, email)
          ),
          requester:user_profiles!requested_by(name, email),
          processor:user_profiles!processed_by(name, email),
          new_contract:contracts!new_contract_id(id, title, approval_status)
        `)
        .eq('requested_by', userId)
        .order('created_at', { ascending: false });

      if (requestedError) throw requestedError;

      // Then get renewals for contracts created by this user
      const { data: ownedContracts, error: ownedError } = await supabase
        .from('contracts')
        .select('id')
        .eq('created_by', userId);

      if (ownedError) throw ownedError;

      const contractIds = ownedContracts.map(c => c.id);
      
      let ownedRenewals = [];
      if (contractIds.length > 0) {
        const { data: renewalsData, error: renewalsError } = await supabase
          .from('contract_renewals')
          .select(`
            *,
            original_contract:contracts!original_contract_id(
              id,
              title,
              client_name,
              client_email,
              contract_value,
              start_date,
              end_date,
              auto_renewal,
              created_by,
              creator:user_profiles!created_by(name, email)
            ),
            requester:user_profiles!requested_by(name, email),
            processor:user_profiles!processed_by(name, email),
            new_contract:contracts!new_contract_id(id, title, approval_status)
          `)
          .in('original_contract_id', contractIds)
          .order('created_at', { ascending: false });

        if (renewalsError) throw renewalsError;
        ownedRenewals = renewalsData || [];
      }

      // Combine and deduplicate results
      const allRenewals = [...(requestedRenewals || []), ...ownedRenewals];
      const uniqueRenewals = allRenewals.filter((renewal, index, self) => 
        index === self.findIndex(r => r.id === renewal.id)
      );

      let data = uniqueRenewals;
      if (statusFilter) {
        data = data.filter(r => r.status === statusFilter);
      }

      // Calculate additional metrics
      const totalRenewals = data.length;
      const pendingRenewals = data.filter(r => r.status === 'pending').length;
      const approvedRenewals = data.filter(r => r.status === 'approved').length;
      const autoRenewals = data.filter(r => r.auto_renewal).length;

      return {
        success: true,
        renewals: data,
        metrics: {
          total_renewals: totalRenewals,
          pending_renewals: pendingRenewals,
          approved_renewals: approvedRenewals,
          auto_renewals: autoRenewals,
          approval_rate: totalRenewals > 0 ? (approvedRenewals / totalRenewals) * 100 : 0
        },
        fetched_at: new Date().toISOString()
      };
    }

    // For admins and supervisors, use the original single query
    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Calculate additional metrics
    const totalRenewals = data.length;
    const pendingRenewals = data.filter(r => r.status === 'pending').length;
    const approvedRenewals = data.filter(r => r.status === 'approved').length;
    const autoRenewals = data.filter(r => r.auto_renewal).length;

    return {
      success: true,
      renewals: data,
      metrics: {
        total_renewals: totalRenewals,
        pending_renewals: pendingRenewals,
        approved_renewals: approvedRenewals,
        auto_renewals: autoRenewals,
        approval_rate: totalRenewals > 0 ? (approvedRenewals / totalRenewals) * 100 : 0
      },
      fetched_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error listing renewals:', error);
    throw error;
  }
}

async function createRenewal(supabase: any, userId: string, data: RenewalRequest) {
  try {
    console.log('🆕 Creating renewal request:', data);

    // Verify the user has permission to request renewal for this contract
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, created_by, title, client_name, end_date, auto_renewal')
      .eq('id', data.original_contract_id)
      .single();

    if (contractError) throw contractError;

    // Check if user is the creator or a signatory
    const canRequest = contract.created_by === userId || await isUserSignatory(supabase, data.original_contract_id, userId);
    
    if (!canRequest) {
      throw new Error('No tienes permisos para solicitar renovación de este contrato');
    }

    // Check if there's already a pending renewal
    const { data: existingRenewal, error: existingError } = await supabase
      .from('contract_renewals')
      .select('id')
      .eq('original_contract_id', data.original_contract_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingError) throw existingError;
    
    if (existingRenewal) {
      throw new Error('Ya existe una solicitud de renovación pendiente para este contrato');
    }

    // Create renewal request
    const { data: renewal, error: renewalError } = await supabase
      .from('contract_renewals')
      .insert({
        original_contract_id: data.original_contract_id,
        requested_by: userId,
        proposed_changes: data.proposed_changes || {},
        proposed_start_date: data.proposed_start_date,
        proposed_end_date: data.proposed_end_date,
        proposed_value: data.proposed_value,
        auto_renewal: data.auto_renewal || false,
        priority: getDaysUntilExpiry(contract.end_date) <= 10 ? 'urgent' : 'medium'
      })
      .select()
      .single();

    if (renewalError) throw renewalError;

    // Create notification for contract creator (if different from requester)
    if (contract.created_by !== userId) {
      await supabase
        .from('notifications')
        .insert({
          user_id: contract.created_by,
          type: 'renewal_request',
          title: 'Nueva solicitud de renovación',
          message: `Se ha solicitado renovar el contrato "${contract.title}" con ${contract.client_name}`,
          data: {
            renewal_id: renewal.id,
            contract_id: data.original_contract_id,
            requested_by: userId
          },
          priority: getDaysUntilExpiry(contract.end_date) <= 10 ? 'urgent' : 'medium',
          action_url: `/dashboard/renewals/${renewal.id}`,
          action_label: 'Ver Solicitud'
        });
    }

    console.log('✅ Renewal request created successfully');

    return {
      success: true,
      renewal: renewal,
      message: 'Solicitud de renovación creada exitosamente'
    };

  } catch (error) {
    console.error('❌ Error creating renewal:', error);
    throw error;
  }
}

async function processRenewal(supabase: any, userId: string, data: RenewalResponse) {
  try {
    console.log('🔄 Processing renewal:', data);
    console.log('📋 Processing renewal with status:', data.status);

    // Get renewal details
    const { data: renewal, error: renewalError } = await supabase
      .from('contract_renewals')
      .select(`
        *,
        original_contract:contracts!original_contract_id(*)
      `)
      .eq('id', data.renewal_id)
      .single();

    if (renewalError) throw renewalError;

    // Verify user has permission to process this renewal
    const canProcess = renewal.original_contract.created_by === userId || await isUserSupervisorOrAdmin(supabase, userId);
    
    if (!canProcess) {
      throw new Error('No tienes permisos para procesar esta renovación');
    }

    // Update renewal status
    const { error: updateError } = await supabase
      .from('contract_renewals')
      .update({
        status: data.status,
        gestor_response: data.gestor_response,
        processed_by: userId,
        processed_at: new Date().toISOString()
      })
      .eq('id', data.renewal_id);

    if (updateError) throw updateError;

    if (data.status === 'approved') {
      console.log('✅ Renewal APPROVED - Creating new contract...');
      // Create new contract based on renewal
      const newContract = await createRenewalContract(supabase, renewal, userId);
      
      // Update renewal with new contract ID
      await supabase
        .from('contract_renewals')
        .update({ new_contract_id: newContract.id })
        .eq('id', data.renewal_id);

      // Create notification for requester
      await supabase
        .from('notifications')
        .insert({
          user_id: renewal.requested_by,
          type: 'renewal_approved',
          title: 'Renovación aprobada',
          message: `Tu solicitud de renovación para "${renewal.original_contract.title}" ha sido aprobada`,
          data: {
            renewal_id: data.renewal_id,
            new_contract_id: newContract.id,
            original_contract_id: renewal.original_contract_id
          },
          priority: 'high',
          action_url: `/dashboard/contracts/${newContract.id}`,
          action_label: 'Ver Nuevo Contrato'
        });

      return {
        success: true,
        message: 'Renovación aprobada y nuevo contrato creado',
        new_contract: newContract
      };
    } else {
      console.log('❌ Renewal REJECTED - NOT creating new contract');
      // Create notification for requester (rejection)
      await supabase
        .from('notifications')
        .insert({
          user_id: renewal.requested_by,
          type: 'renewal_rejected',
          title: 'Renovación rechazada',
          message: `Tu solicitud de renovación para "${renewal.original_contract.title}" ha sido rechazada`,
          data: {
            renewal_id: data.renewal_id,
            rejection_reason: data.gestor_response,
            original_contract_id: renewal.original_contract_id
          },
          priority: 'medium'
        });

      return {
        success: true,
        message: 'Renovación rechazada - No se creó contrato nuevo'
      };
    }

  } catch (error) {
    console.error('❌ Error processing renewal:', error);
    throw error;
  }
}

async function escalateRenewal(supabase: any, renewalId: string) {
  try {
    console.log('⬆️ Escalating renewal:', renewalId);

    // Get renewal and find appropriate supervisor
    const { data: renewal, error: renewalError } = await supabase
      .from('contract_renewals')
      .select(`
        *,
        original_contract:contracts!original_contract_id(created_by)
      `)
      .eq('id', renewalId)
      .single();

    if (renewalError) throw renewalError;

    // Find supervisor or admin to escalate to
    const { data: supervisors, error: supervisorError } = await supabase
      .from('user_profiles')
      .select('id, name, email')
      .in('role', ['supervisor', 'admin'])
      .limit(1);

    if (supervisorError || !supervisors.length) {
      throw new Error('No supervisor available for escalation');
    }

    const supervisor = supervisors[0];

    // Update renewal with escalation info
    const { error: updateError } = await supabase
      .from('contract_renewals')
      .update({
        escalated_at: new Date().toISOString(),
        escalated_to: supervisor.id,
        escalation_reason: 'Gestor no respondió en tiempo establecido',
        priority: 'urgent'
      })
      .eq('id', renewalId);

    if (updateError) throw updateError;

    // Create notification for supervisor
    await supabase
      .from('notifications')
      .insert({
        user_id: supervisor.id,
        type: 'renewal_request',
        title: 'Renovación escalada requiere atención',
        message: `Una solicitud de renovación ha sido escalada y requiere revisión urgente`,
        data: {
          renewal_id: renewalId,
          escalated_from: renewal.original_contract.created_by,
          original_contract_id: renewal.original_contract_id
        },
        priority: 'urgent',
        action_url: `/dashboard/renewals/${renewalId}`,
        action_label: 'Revisar Ahora'
      });

    console.log('✅ Renewal escalated successfully');

    return {
      success: true,
      message: 'Renovación escalada exitosamente',
      escalated_to: supervisor.name
    };

  } catch (error) {
    console.error('❌ Error escalating renewal:', error);
    throw error;
  }
}

// Helper functions
async function isUserSignatory(supabase: any, contractId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('contract_signatories')
    .select('id')
    .eq('contract_id', contractId)
    .eq('user_id', userId)
    .maybeSingle();

  return !error && !!data;
}

async function isUserSupervisorOrAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single();

  return !error && data && ['supervisor', 'admin'].includes(data.role);
}

async function createRenewalContract(supabase: any, renewal: any, processedBy: string) {
  try {
    const originalContract = renewal.original_contract;
    
    // Create new contract based on original + proposed changes
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        template_id: originalContract.template_id,
        title: `${originalContract.title} (Renovación)`,
        content: originalContract.content,
        variables_data: {
          ...originalContract.variables_data,
          ...renewal.proposed_changes
        },
        client_name: originalContract.client_name,
        client_email: originalContract.client_email,
        client_phone: originalContract.client_phone,
        contract_value: renewal.proposed_value || originalContract.contract_value,
        start_date: renewal.proposed_start_date,
        end_date: renewal.proposed_end_date,
        notes: `Renovación del contrato ${originalContract.id}. ${renewal.gestor_response || ''}`,
        status: 'draft', 
        approval_status: 'draft',
        created_by: originalContract.created_by,
        parent_contract_id: originalContract.id,
        renewal_type: renewal.auto_renewal ? 'auto_renewal' : 'manual_renewal',
        auto_renewal: originalContract.auto_renewal // Inherit auto_renewal setting
      })
      .select()
      .single();

    if (contractError) throw contractError;

    // Copy signatories from original contract
    const { data: originalSignatories, error: signatoriesError } = await supabase
      .from('contract_signatories')
      .select('*')
      .eq('contract_id', originalContract.id);

    if (signatoriesError) throw signatoriesError;

    if (originalSignatories && originalSignatories.length > 0) {
      const newSignatories = originalSignatories.map(s => ({
        contract_id: newContract.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        role: s.role,
        signing_order: s.signing_order,
        user_id: s.user_id,
        status: 'pending'
      }));

      const { error: newSignatoriesError } = await supabase
        .from('contract_signatories')
        .insert(newSignatories);

      if (newSignatoriesError) throw newSignatoriesError;
    }

    // Mark original contract as renewed
    await supabase
      .from('contracts')
      .update({ 
        actual_status: 'renewed',
        updated_at: new Date().toISOString()
      })
      .eq('id', originalContract.id);

    console.log('✅ Renewal contract created successfully');

    return newContract;

  } catch (error) {
    console.error('❌ Error creating renewal contract:', error);
    throw error;
  }
}

function getDaysUntilExpiry(endDate: string): number {
  return Math.ceil(
    (new Date(endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
}