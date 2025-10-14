import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// This function should be called daily via cron job
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🔄 Starting daily contract expiry check...');

    // Step 1: Update contract statuses based on dates
    const statusUpdateResult = await updateContractStatuses(supabase);
    
    // Step 2: Generate expiry notifications
    const notificationResult = await generateExpiryNotifications(supabase);
    
    // Step 3: Process auto-renewals
    const autoRenewalResult = await processAutoRenewals(supabase);
    
    // Step 4: Escalate overdue renewals
    const escalationResult = await escalateOverdueRenewals(supabase);

    // Step 5: Clean up old notifications
    const cleanupResult = await cleanupOldNotifications(supabase);

    const summary = {
      success: true,
      executed_at: new Date().toISOString(),
      results: {
        status_updates: statusUpdateResult,
        notifications: notificationResult,
        auto_renewals: autoRenewalResult,
        escalations: escalationResult,
        cleanup: cleanupResult
      }
    };

    console.log('✅ Daily expiry check completed successfully');
    console.log('📊 Summary:', summary);

    return new Response(JSON.stringify(summary), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('❌ Error in daily expiry check:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error en verificación diaria de vencimientos',
      success: false,
      executed_at: new Date().toISOString()
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
    console.log('📅 Updating contract statuses based on dates...');

    const today = new Date().toISOString().split('T')[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Update to expiring_soon (30 days before end_date)
    const { data: expiringSoon, error: expiringSoonError } = await supabase
      .from('contracts')
      .update({ actual_status: 'expiring_soon' })
      .not('end_date', 'is', null)
      .gte('end_date', today)
      .lte('end_date', in30Days)
      .eq('approval_status', 'signed')
      .not('actual_status', 'in', ['expiring_soon', 'expired', 'completed', 'cancelled', 'renewed'])
      .select('id, title, end_date');

    if (expiringSoonError) throw expiringSoonError;

    // Update to expired (past end_date)
    const { data: expired, error: expiredError } = await supabase
      .from('contracts')
      .update({ actual_status: 'expired' })
      .not('end_date', 'is', null)
      .lt('end_date', today)
      .eq('approval_status', 'signed')
      .not('actual_status', 'in', ['expired', 'completed', 'cancelled', 'renewed'])
      .select('id, title, end_date');

    if (expiredError) throw expiredError;

    console.log(`✅ Updated ${expiringSoon?.length || 0} contracts to expiring_soon`);
    console.log(`✅ Updated ${expired?.length || 0} contracts to expired`);

    return {
      expiring_soon: expiringSoon?.length || 0,
      expired: expired?.length || 0,
      updated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error updating contract statuses:', error);
    throw error;
  }
}

async function generateExpiryNotifications(supabase: any) {
  try {
    console.log('🔔 Generating expiry notifications...');

    const today = new Date();
    const notificationDays = [30, 15, 10, 5, 1];
    let totalNotifications = 0;

    for (const days of notificationDays) {
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + days);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      // Find contracts expiring on target date
      const { data: expiringContracts, error } = await supabase
        .from('contracts')
        .select(`
          id,
          title,
          client_name,
          end_date,
          contract_value,
          auto_renewal,
          created_by,
          creator:user_profiles!created_by(name, email)
        `)
        .eq('end_date', targetDateStr)
        .eq('approval_status', 'signed')
        .in('actual_status', ['active', 'expiring_soon']);

      if (error) {
        console.error(`Error getting contracts expiring in ${days} days:`, error);
        continue;
      }

      for (const contract of expiringContracts) {
        // Check if notification already exists for this contract and day count
        const { data: existingNotification } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', contract.created_by)
          .eq('type', 'contract_expiring')
          .contains('data', { contract_id: contract.id, days_until_expiry: days })
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (existingNotification) continue;

        const priority = days <= 1 ? 'urgent' : days <= 5 ? 'high' : days <= 10 ? 'medium' : 'low';
        
        const notification = {
          user_id: contract.created_by,
          type: 'contract_expiring',
          title: `Contrato vence en ${days} día${days !== 1 ? 's' : ''}`,
          message: `El contrato "${contract.title}" con ${contract.client_name} vence el ${new Date(contract.end_date).toLocaleDateString('es-ES')}${contract.auto_renewal ? ' (Renovación automática activada)' : ''}`,
          data: {
            contract_id: contract.id,
            days_until_expiry: days,
            auto_renewal: contract.auto_renewal,
            contract_value: contract.contract_value,
            client_name: contract.client_name
          },
          priority: priority,
          action_url: `/dashboard/contracts/${contract.id}`,
          action_label: contract.auto_renewal ? 'Ver Estado' : 'Solicitar Renovación'
        };

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notification);

        if (!notificationError) {
          totalNotifications++;
        }

        // Also notify supervisors for urgent cases
        if (days <= 5) {
          const { data: supervisors } = await supabase
            .from('user_profiles')
            .select('id')
            .in('role', ['supervisor', 'admin']);

          if (supervisors) {
            const supervisorNotifications = supervisors.map(supervisor => ({
              user_id: supervisor.id,
              type: 'contract_expiring',
              title: `⚠️ Contrato crítico vence en ${days} día${days !== 1 ? 's' : ''}`,
              message: `URGENTE: El contrato "${contract.title}" del gestor ${contract.creator?.name} vence pronto`,
              data: {
                contract_id: contract.id,
                days_until_expiry: days,
                gestor_id: contract.created_by,
                gestor_name: contract.creator?.name
              },
              priority: 'urgent',
              action_url: `/dashboard/contracts/${contract.id}`,
              action_label: 'Revisar Contrato'
            }));

            await supabase
              .from('notifications')
              .insert(supervisorNotifications);
          }
        }
      }
    }

    console.log(`✅ Generated ${totalNotifications} expiry notifications`);

    return {
      notifications_created: totalNotifications,
      checked_days: notificationDays,
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error generating expiry notifications:', error);
    throw error;
  }
}

async function processAutoRenewals(supabase: any) {
  try {
    console.log('🔄 Processing auto-renewals...');

    // Find pending auto-renewals
    const { data: autoRenewals, error } = await supabase
      .from('contract_renewals')
      .select(`
        *,
        original_contract:contracts!original_contract_id(*)
      `)
      .eq('auto_renewal', true)
      .eq('status', 'pending')
      .lte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // At least 1 day old

    if (error) throw error;

    let processedRenewals = 0;

    for (const renewal of autoRenewals) {
      try {
        // Automatically approve auto-renewals after 24 hours
        const { error: updateError } = await supabase
          .from('contract_renewals')
          .update({
            status: 'approved',
            processed_by: renewal.original_contract.created_by,
            processed_at: new Date().toISOString(),
            gestor_response: 'Aprobación automática por renovación programada'
          })
          .eq('id', renewal.id);

        if (updateError) throw updateError;

        // Create new contract
        const newContract = await createRenewalContract(supabase, renewal);
        
        // Update renewal with new contract ID
        await supabase
          .from('contract_renewals')
          .update({ new_contract_id: newContract.id })
          .eq('id', renewal.id);

        // Create notification
        await supabase
          .from('notifications')
          .insert({
            user_id: renewal.requested_by,
            type: 'renewal_approved',
            title: 'Renovación automática procesada',
            message: `Tu contrato "${renewal.original_contract.title}" ha sido renovado automáticamente`,
            data: {
              renewal_id: renewal.id,
              new_contract_id: newContract.id,
              original_contract_id: renewal.original_contract_id,
              auto_renewal: true
            },
            priority: 'medium',
            action_url: `/dashboard/contracts/${newContract.id}`,
            action_label: 'Ver Nuevo Contrato'
          });

        processedRenewals++;
        console.log(`✅ Processed auto-renewal for contract ${renewal.original_contract_id}`);

      } catch (error) {
        console.error(`❌ Error processing auto-renewal ${renewal.id}:`, error);
      }
    }

    return {
      processed_renewals: processedRenewals,
      total_auto_renewals: autoRenewals.length,
      processed_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error processing auto-renewals:', error);
    throw error;
  }
}

async function escalateOverdueRenewals(supabase: any) {
  try {
    console.log('⬆️ Checking for overdue renewals to escalate...');

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Find pending renewals older than 3 days that haven't been escalated
    const { data: overdueRenewals, error } = await supabase
      .from('contract_renewals')
      .select(`
        *,
        original_contract:contracts!original_contract_id(title, created_by, end_date)
      `)
      .eq('status', 'pending')
      .lt('created_at', threeDaysAgo)
      .is('escalated_at', null)
      .eq('auto_renewal', false); // Don't escalate auto-renewals

    if (error) throw error;

    let escalatedCount = 0;

    for (const renewal of overdueRenewals) {
      try {
        // Find supervisor to escalate to
        const { data: supervisors, error: supervisorError } = await supabase
          .from('user_profiles')
          .select('id, name')
          .in('role', ['supervisor', 'admin'])
          .limit(1);

        if (supervisorError || !supervisors.length) {
          console.log('No supervisor found for escalation');
          continue;
        }

        const supervisor = supervisors[0];

        // Update renewal with escalation info
        const { error: updateError } = await supabase
          .from('contract_renewals')
          .update({
            escalated_at: new Date().toISOString(),
            escalated_to: supervisor.id,
            escalation_reason: 'Solicitud de renovación sin respuesta por más de 3 días',
            priority: 'urgent'
          })
          .eq('id', renewal.id);

        if (updateError) throw updateError;

        // Create notification for supervisor
        await supabase
          .from('notifications')
          .insert({
            user_id: supervisor.id,
            type: 'renewal_request',
            title: '🚨 Renovación escalada - Acción requerida',
            message: `Una solicitud de renovación para "${renewal.original_contract.title}" ha sido escalada por falta de respuesta`,
            data: {
              renewal_id: renewal.id,
              original_contract_id: renewal.original_contract_id,
              escalated_from: renewal.original_contract.created_by,
              days_overdue: Math.ceil((new Date().getTime() - new Date(renewal.created_at).getTime()) / (1000 * 60 * 60 * 24))
            },
            priority: 'urgent',
            action_url: `/dashboard/renewals/${renewal.id}`,
            action_label: 'Revisar Ahora'
          });

        escalatedCount++;
        console.log(`✅ Escalated renewal ${renewal.id} to supervisor ${supervisor.name}`);

      } catch (error) {
        console.error(`❌ Error escalating renewal ${renewal.id}:`, error);
      }
    }

    return {
      escalated_renewals: escalatedCount,
      total_overdue: overdueRenewals.length,
      escalated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error escalating overdue renewals:', error);
    throw error;
  }
}

async function cleanupOldNotifications(supabase: any) {
  try {
    console.log('🧹 Cleaning up old notifications...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Delete old read notifications
    const { data: deletedRead, error: deleteReadError } = await supabase
      .from('notifications')
      .delete()
      .not('read_at', 'is', null)
      .lt('read_at', thirtyDaysAgo)
      .select('id');

    if (deleteReadError) throw deleteReadError;

    // Delete expired notifications
    const { data: deletedExpired, error: deleteExpiredError } = await supabase
      .from('notifications')
      .delete()
      .not('expires_at', 'is', null)
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (deleteExpiredError) throw deleteExpiredError;

    console.log(`✅ Cleaned up ${(deletedRead?.length || 0) + (deletedExpired?.length || 0)} old notifications`);

    return {
      deleted_read: deletedRead?.length || 0,
      deleted_expired: deletedExpired?.length || 0,
      cleaned_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error cleaning up notifications:', error);
    throw error;
  }
}

async function createRenewalContract(supabase: any, renewal: any) {
  try {
    const originalContract = renewal.original_contract;
    
    // Create new contract based on original + proposed changes
    const { data: newContract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        template_id: originalContract.template_id,
        title: `${originalContract.title} (Renovación ${renewal.auto_renewal ? 'Automática' : 'Manual'})`,
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
        notes: `Renovación ${renewal.auto_renewal ? 'automática' : 'manual'} del contrato ${originalContract.id}. ${renewal.gestor_response || ''}`,
        status: 'draft',
        approval_status: 'pending_approval',
        created_by: originalContract.created_by,
        parent_contract_id: originalContract.id,
        renewal_type: renewal.auto_renewal ? 'auto_renewal' : 'manual_renewal',
        auto_renewal: originalContract.auto_renewal,
        actual_status: 'draft'
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

      await supabase
        .from('contract_signatories')
        .insert(newSignatories);
    }

    // Mark original contract as renewed
    await supabase
      .from('contracts')
      .update({ 
        actual_status: 'renewed',
        updated_at: new Date().toISOString()
      })
      .eq('id', originalContract.id);

    return newContract;

  } catch (error) {
    console.error('❌ Error creating renewal contract:', error);
    throw error;
  }
}