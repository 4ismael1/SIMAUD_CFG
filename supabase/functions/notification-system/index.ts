import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface NotificationRequest {
  user_id?: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  action_url?: string;
  action_label?: string;
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
        const unreadOnly = url.searchParams.get('unread_only') === 'true';
        result = await getUserNotifications(supabase, user.id, unreadOnly);
        break;
      case 'create':
        const createData: NotificationRequest = await req.json();
        result = await createNotification(supabase, createData);
        break;
      case 'mark_read':
        const notificationId = url.searchParams.get('notification_id');
        if (!notificationId) throw new Error('Notification ID required');
        result = await markNotificationRead(supabase, user.id, notificationId);
        break;
      case 'mark_all_read':
        result = await markAllNotificationsRead(supabase, user.id);
        break;
      case 'delete':
        const deleteId = url.searchParams.get('notification_id');
        if (!deleteId) throw new Error('Notification ID required');
        result = await deleteNotification(supabase, user.id, deleteId);
        break;
      case 'generate_expiry_notifications':
        result = await generateExpiryNotifications(supabase);
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
    console.error('Error in notification system:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error en sistema de notificaciones',
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

async function getUserNotifications(supabase: any, userId: string, unreadOnly: boolean = false) {
  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (unreadOnly) {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Get unread count
    const { count: unreadCount, error: countError } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    if (countError) throw countError;

    // Group by type for summary
    const byType = data.reduce((acc: any, notification: any) => {
      acc[notification.type] = (acc[notification.type] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      notifications: data,
      unread_count: unreadCount || 0,
      total_count: data.length,
      by_type: byType,
      fetched_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error getting user notifications:', error);
    throw error;
  }
}

async function createNotification(supabase: any, data: NotificationRequest) {
  try {
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: data.user_id,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
        priority: data.priority || 'medium',
        action_url: data.action_url,
        action_label: data.action_label,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days default
      })
      .select()
      .single();

    if (error) throw error;

    console.log('✅ Notification created successfully');

    return {
      success: true,
      notification: notification,
      message: 'Notificación creada exitosamente'
    };

  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
}

async function markNotificationRead(supabase: any, userId: string, notificationId: string) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return {
      success: true,
      message: 'Notificación marcada como leída'
    };

  } catch (error) {
    console.error('❌ Error marking notification read:', error);
    throw error;
  }
}

async function markAllNotificationsRead(supabase: any, userId: string) {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) throw error;

    return {
      success: true,
      message: 'Todas las notificaciones marcadas como leídas'
    };

  } catch (error) {
    console.error('❌ Error marking all notifications read:', error);
    throw error;
  }
}

async function deleteNotification(supabase: any, userId: string, notificationId: string) {
  try {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;

    return {
      success: true,
      message: 'Notificación eliminada'
    };

  } catch (error) {
    console.error('❌ Error deleting notification:', error);
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
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
          .maybeSingle();

        if (existingNotification) {
          console.log(`Notification already exists for contract ${contract.id} (${days} days)`);
          continue;
        }

        const priority = days <= 1 ? 'urgent' : days <= 5 ? 'high' : days <= 10 ? 'medium' : 'low';
        
        const notification = {
          user_id: contract.created_by,
          type: 'contract_expiring',
          title: `Contrato vence en ${days} día${days !== 1 ? 's' : ''}`,
          message: `El contrato "${contract.title}" con ${contract.client_name} vence el ${new Date(contract.end_date).toLocaleDateString('es-ES')}`,
          data: {
            contract_id: contract.id,
            days_until_expiry: days,
            auto_renewal: contract.auto_renewal,
            contract_value: contract.contract_value,
            client_name: contract.client_name
          },
          priority: priority,
          action_url: `/dashboard/contracts/${contract.id}`,
          action_label: contract.auto_renewal ? 'Ver Auto-renovación' : 'Solicitar Renovación'
        };

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notification);

        if (notificationError) {
          console.error('Error creating notification:', notificationError);
        } else {
          totalNotifications++;
          console.log(`✅ Created expiry notification for contract ${contract.id} (${days} days)`);
        }

        // Also notify supervisors and admins for urgent cases
        if (days <= 5) {
          const { data: supervisors, error: supervisorError } = await supabase
            .from('user_profiles')
            .select('id')
            .in('role', ['supervisor', 'admin']);

          if (!supervisorError && supervisors) {
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
      success: true,
      notifications_created: totalNotifications,
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error generating expiry notifications:', error);
    throw error;
  }
}