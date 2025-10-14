import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface UserReportParams {
  type: 'by-role' | 'activity' | 'registrations' | 'productivity';
  startDate?: string;
  endDate?: string;
  role?: string;
  format: 'json' | 'csv';
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
    const params: UserReportParams = {
      type: url.searchParams.get('type') as any || 'by-role',
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      role: url.searchParams.get('role') || undefined,
      format: url.searchParams.get('format') as any || 'json'
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data: any = {};

    switch (params.type) {
      case 'by-role':
        data = await getUsersByRole(supabase, params);
        break;
      case 'activity':
        data = await getUserActivity(supabase, params);
        break;
      case 'registrations':
        data = await getUserRegistrations(supabase, params);
        break;
      case 'productivity':
        data = await getUserProductivity(supabase, params);
        break;
      default:
        throw new Error('Tipo de reporte no válido');
    }

    if (params.format === 'csv') {
      const csv = convertToCSV(data, params.type);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="users-report-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error generating user report:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generando reporte de usuarios' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

async function getUsersByRole(supabase: any, params: UserReportParams) {
  const query = supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.role) {
    query.eq('role', params.role);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Agrupar por rol
  const roleGroups = data.reduce((acc: any, user: any) => {
    const role = user.role;
    if (!acc[role]) {
      acc[role] = [];
    }
    acc[role].push(user);
    return acc;
  }, {});

  return {
    type: 'users_by_role',
    generated_at: new Date().toISOString(),
    total_users: data.length,
    by_role: Object.keys(roleGroups).map(role => ({
      role,
      count: roleGroups[role].length,
      percentage: (roleGroups[role].length / data.length) * 100,
      users: roleGroups[role]
    })),
    summary: {
      admin: roleGroups.admin?.length || 0,
      supervisor: roleGroups.supervisor?.length || 0,
      gestor: roleGroups.gestor?.length || 0,
      user: roleGroups.user?.length || 0
    }
  };
}

async function getUserActivity(supabase: any, params: UserReportParams) {
  // Obtener actividad de usuarios basada en contratos creados
  const { data: contractActivity, error: contractError } = await supabase
    .from('contracts')
    .select(`
      created_by,
      created_at,
      approval_status,
      creator:user_profiles!created_by(name, email, role)
    `)
    .gte('created_at', params.startDate || '2024-01-01')
    .lte('created_at', params.endDate || new Date().toISOString())
    .order('created_at', { ascending: false });

  if (contractError) throw contractError;

  // Obtener actividad de firmantes
  const { data: signatureActivity, error: signatureError } = await supabase
    .from('contract_signatories')
    .select(`
      user_id,
      signed_at,
      contract_id,
      name,
      email
    `)
    .not('signed_at', 'is', null)
    .gte('signed_at', params.startDate || '2024-01-01')
    .lte('signed_at', params.endDate || new Date().toISOString());

  if (signatureError) throw signatureError;

  // Procesar actividad de contratos
  const userActivity = contractActivity.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    if (!acc[userId]) {
      acc[userId] = {
        user_id: userId,
        user_name: contract.creator?.name || 'Desconocido',
        user_email: contract.creator?.email,
        user_role: contract.creator?.role,
        contracts_created: 0,
        contracts_signed: 0,
        last_activity: contract.created_at
      };
    }
    acc[userId].contracts_created++;
    return acc;
  }, {});

  // Procesar actividad de firmas
  signatureActivity.forEach((signature: any) => {
    if (signature.user_id) {
      if (!userActivity[signature.user_id]) {
        userActivity[signature.user_id] = {
          user_id: signature.user_id,
          user_name: signature.name,
          user_email: signature.email,
          user_role: 'user',
          contracts_created: 0,
          contracts_signed: 0,
          last_activity: signature.signed_at
        };
      }
      userActivity[signature.user_id].contracts_signed++;
      
      // Actualizar última actividad si es más reciente
      if (new Date(signature.signed_at) > new Date(userActivity[signature.user_id].last_activity)) {
        userActivity[signature.user_id].last_activity = signature.signed_at;
      }
    }
  });

  return {
    type: 'user_activity',
    generated_at: new Date().toISOString(),
    period: `${params.startDate || '2024-01-01'} to ${params.endDate || new Date().toISOString().split('T')[0]}`,
    users: Object.values(userActivity).sort((a: any, b: any) => 
      new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
    )
  };
}

async function getUserRegistrations(supabase: any, params: UserReportParams) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .gte('created_at', params.startDate || '2024-01-01')
    .lte('created_at', params.endDate || new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Agrupar por mes
  const monthlyRegistrations = data.reduce((acc: any, user: any) => {
    const date = new Date(user.created_at);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(user);
    return acc;
  }, {});

  return {
    type: 'user_registrations',
    generated_at: new Date().toISOString(),
    total_registrations: data.length,
    by_month: Object.keys(monthlyRegistrations).sort().map(month => ({
      month,
      count: monthlyRegistrations[month].length,
      users: monthlyRegistrations[month]
    })),
    recent_users: data.slice(0, 10)
  };
}

async function getUserProductivity(supabase: any, params: UserReportParams) {
  // Obtener productividad basada en contratos creados y aprobados
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      created_by,
      approval_status,
      contract_value,
      created_at,
      approved_at,
      creator:user_profiles!created_by(name, email, role)
    `)
    .gte('created_at', params.startDate || '2024-01-01')
    .lte('created_at', params.endDate || new Date().toISOString());

  if (error) throw error;

  const productivity = data.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    if (!acc[userId]) {
      acc[userId] = {
        user_id: userId,
        user_name: contract.creator?.name || 'Desconocido',
        user_email: contract.creator?.email,
        user_role: contract.creator?.role,
        total_contracts: 0,
        approved_contracts: 0,
        rejected_contracts: 0,
        pending_contracts: 0,
        total_value: 0,
        approval_rate: 0,
        average_approval_time: 0
      };
    }

    acc[userId].total_contracts++;
    acc[userId].total_value += contract.contract_value || 0;

    if (contract.approval_status === 'approved') {
      acc[userId].approved_contracts++;
    } else if (contract.approval_status === 'rejected') {
      acc[userId].rejected_contracts++;
    } else if (contract.approval_status === 'pending_approval') {
      acc[userId].pending_contracts++;
    }

    return acc;
  }, {});

  // Calcular tasas de aprobación
  Object.values(productivity).forEach((user: any) => {
    if (user.total_contracts > 0) {
      user.approval_rate = (user.approved_contracts / user.total_contracts) * 100;
    }
  });

  return {
    type: 'user_productivity',
    generated_at: new Date().toISOString(),
    period: `${params.startDate || '2024-01-01'} to ${params.endDate || new Date().toISOString().split('T')[0]}`,
    users: Object.values(productivity).sort((a: any, b: any) => b.total_contracts - a.total_contracts)
  };
}

function convertToCSV(data: any, type: string): string {
  let csv = '';
  
  switch (type) {
    case 'by-role':
      csv += 'Role,Count,Percentage\n';
      data.by_role.forEach((item: any) => {
        csv += `${item.role},${item.count},${item.percentage.toFixed(2)}%\n`;
      });
      break;
    case 'activity':
      csv += 'User Name,Email,Role,Contracts Created,Contracts Signed,Last Activity\n';
      data.users.forEach((user: any) => {
        csv += `${user.user_name},${user.user_email},${user.user_role},${user.contracts_created},${user.contracts_signed},${user.last_activity}\n`;
      });
      break;
    case 'registrations':
      csv += 'Month,Registrations\n';
      data.by_month.forEach((item: any) => {
        csv += `${item.month},${item.count}\n`;
      });
      break;
    case 'productivity':
      csv += 'User Name,Email,Role,Total Contracts,Approved,Rejected,Pending,Approval Rate,Total Value\n';
      data.users.forEach((user: any) => {
        csv += `${user.user_name},${user.user_email},${user.user_role},${user.total_contracts},${user.approved_contracts},${user.rejected_contracts},${user.pending_contracts},${user.approval_rate.toFixed(2)}%,${user.total_value}\n`;
      });
      break;
  }

  return csv;
}