import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface LifecycleParams {
  action: 'update_statuses' | 'check_expiry' | 'get_expiring';
  contractId?: string;
  daysAhead?: number;
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
    const params: LifecycleParams = {
      action: url.searchParams.get('action') as any || 'update_statuses',
      contractId: url.searchParams.get('contractId') || undefined,
      daysAhead: parseInt(url.searchParams.get('daysAhead') || '30')
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let result: any = {};

    switch (params.action) {
      case 'update_statuses':
        result = await updateContractStatuses(supabase);
        break;
      case 'check_expiry':
        result = await checkContractExpiry(supabase, params.daysAhead);
        break;
      case 'get_expiring':
        result = await getExpiringContracts(supabase, params.daysAhead);
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
    console.error('Error in contract lifecycle:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error en ciclo de vida del contrato',
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

async function updateContractStatuses(supabase: any) {
  try {
    console.log('🔄 Updating contract statuses based on dates...');

    // Call the database function to update statuses
    const { data: updateResults, error } = await supabase.rpc('update_contract_status_by_date');
    
    if (error) throw error;

    console.log('📊 Status update results:', updateResults);

    // Get current status distribution
    const { data: allContracts, error: countError } = await supabase
      .from('contracts')
      .select('actual_status, approval_status, end_date')
      .eq('approval_status', 'signed');

    if (countError) throw countError;

    // Count by actual_status
    const actualStatusCounts = allContracts.reduce((acc: any, contract: any) => {
      acc[contract.actual_status] = (acc[contract.actual_status] || 0) + 1;
      return acc;
    }, {});

    // Count contracts updated in this run
    const updatedCounts = updateResults?.reduce((acc: any, result: any) => {
      if (result.old_status !== result.new_status) {
        acc[result.new_status] = (acc[result.new_status] || 0) + 1;
      }
      return acc;
    }, {}) || {};

    console.log('✅ Contract statuses updated successfully');
    console.log('📊 Updated contracts by new status:', updatedCounts);
    console.log('📊 Total contracts by actual status:', actualStatusCounts);

    return {
      success: true,
      message: `Updated ${updateResults?.length || 0} contracts`,
      updated_counts: updatedCounts,
      total_by_status: actualStatusCounts,
      contracts_processed: updateResults?.length || 0,
      updated_at: new Date().toISOString(),
      details: updateResults
    };

  } catch (error) {
    console.error('❌ Error updating contract statuses:', error);
    throw error;
  }
}

async function checkContractExpiry(supabase: any, daysAhead: number = 30) {
  try {
    console.log(`🔍 Checking contracts expiring in ${daysAhead} days...`);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data: expiringContracts, error } = await supabase
      .from('contracts')
      .select(`
        id,
        title,
        client_name,
        client_email,
        end_date,
        contract_value,
        auto_renewal,
        actual_status,
        created_by,
        creator:user_profiles!created_by(name, email)
      `)
      .not('end_date', 'is', null)
      .lte('end_date', futureDate.toISOString().split('T')[0])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .eq('approval_status', 'signed')
      .in('actual_status', ['active', 'expiring_soon']);

    if (error) throw error;

    // Generate notifications for expiring contracts
    const notifications = [];
    const notificationDays = [30, 15, 10, 5, 1];

    for (const contract of expiringContracts) {
      const daysUntilExpiry = Math.ceil(
        (new Date(contract.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      );

      if (notificationDays.includes(daysUntilExpiry)) {
        // Notification for contract creator (gestor)
        notifications.push({
          user_id: contract.created_by,
          type: 'contract_expiring',
          title: `Contrato próximo a vencer (${daysUntilExpiry} días)`,
          message: `El contrato "${contract.title}" con ${contract.client_name} vence el ${new Date(contract.end_date).toLocaleDateString('es-ES')}`,
          data: {
            contract_id: contract.id,
            days_until_expiry: daysUntilExpiry,
            auto_renewal: contract.auto_renewal,
            contract_value: contract.contract_value
          },
          priority: daysUntilExpiry <= 5 ? 'urgent' : daysUntilExpiry <= 10 ? 'high' : 'medium',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          action_url: `/dashboard/contracts/${contract.id}`,
          action_label: 'Ver Contrato'
        });

        // If auto_renewal is enabled, create renewal request automatically
        if (contract.auto_renewal && daysUntilExpiry === 30) {
          console.log(`🔄 Creating auto-renewal for contract ${contract.id}`);
          
          const { error: renewalError } = await supabase
            .from('contract_renewals')
            .insert({
              original_contract_id: contract.id,
              requested_by: contract.created_by,
              status: 'pending',
              auto_renewal: true,
              proposed_start_date: new Date(new Date(contract.end_date).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              proposed_end_date: new Date(new Date(contract.end_date).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              proposed_value: contract.contract_value,
              proposed_changes: {
                auto_generated: true,
                renewal_reason: 'Renovación automática programada',
                original_end_date: contract.end_date
              }
            });

          if (renewalError) {
            console.error('Error creating auto-renewal:', renewalError);
          } else {
            console.log('✅ Auto-renewal created successfully');
          }
        }
      }
    }

    // Insert notifications
    if (notifications.length > 0) {
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notificationError) {
        console.error('Error creating notifications:', notificationError);
      } else {
        console.log(`✅ Created ${notifications.length} notifications`);
      }
    }

    return {
      success: true,
      expiring_contracts: expiringContracts.length,
      notifications_created: notifications.length,
      contracts: expiringContracts,
      checked_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error checking contract expiry:', error);
    throw error;
  }
}

async function getExpiringContracts(supabase: any, daysAhead: number = 30) {
  try {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const { data, error } = await supabase
      .from('contracts')
      .select(`
        id,
        title,
        client_name,
        end_date,
        contract_value,
        auto_renewal,
        actual_status,
        created_by,
        creator:user_profiles!created_by(name, email)
      `)
      .not('end_date', 'is', null)
      .lte('end_date', futureDate.toISOString().split('T')[0])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .eq('approval_status', 'signed')
      .order('end_date', { ascending: true });

    if (error) throw error;

    const contractsWithDays = data.map(contract => ({
      ...contract,
      days_until_expiry: Math.ceil(
        (new Date(contract.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )
    }));

    return {
      success: true,
      contracts: contractsWithDays,
      total_expiring: contractsWithDays.length,
      checked_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error getting expiring contracts:', error);
    throw error;
  }
}