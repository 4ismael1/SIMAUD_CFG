import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface ReportParams {
  type: 'by-status' | 'by-date' | 'by-user' | 'by-value' | 'by-template';
  startDate?: string;
  endDate?: string;
  userId?: string;
  status?: string;
  format: 'json' | 'csv';
  period?: 'week' | 'month' | 'quarter' | 'year';
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
    const params: ReportParams = {
      type: url.searchParams.get('type') as any || 'by-status',
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined,
      userId: url.searchParams.get('userId') || undefined,
      status: url.searchParams.get('status') || undefined,
      format: url.searchParams.get('format') as any || 'json',
      period: url.searchParams.get('period') as any || 'month'
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data: any = {};

    switch (params.type) {
      case 'by-status':
        data = await getContractsByStatus(supabase, params);
        break;
      case 'by-date':
        data = await getContractsByDate(supabase, params);
        break;
      case 'by-user':
        data = await getContractsByUser(supabase, params);
        break;
      case 'by-value':
        data = await getContractsByValue(supabase, params);
        break;
      case 'by-template':
        data = await getContractsByTemplate(supabase, params);
        break;
      default:
        throw new Error('Tipo de reporte no válido');
    }

    if (params.format === 'csv') {
      const csv = convertToCSV(data);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="contracts-report-${new Date().toISOString().split('T')[0]}.csv"`
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
    console.error('Error generating contract report:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generando reporte de contratos' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

async function getContractsByStatus(supabase: any, params: ReportParams) {
  const query = supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      status,
      contract_value,
      client_name,
      created_at,
      updated_at,
      creator:user_profiles!created_by(name, email),
      template:contract_templates(title)
    `)
    .order('created_at', { ascending: false });

  if (params.startDate) {
    query.gte('created_at', params.startDate);
  }
  if (params.endDate) {
    query.lte('created_at', params.endDate);
  }
  if (params.status) {
    query.eq('approval_status', params.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Agrupar por estado
  const statusGroups = data.reduce((acc: any, contract: any) => {
    const status = contract.approval_status;
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(contract);
    return acc;
  }, {});

  return {
    type: 'contracts_by_status',
    generated_at: new Date().toISOString(),
    total_contracts: data.length,
    by_status: Object.keys(statusGroups).map(status => ({
      status,
      count: statusGroups[status].length,
      contracts: statusGroups[status],
      total_value: statusGroups[status].reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0)
    })),
    summary: {
      draft: statusGroups.draft?.length || 0,
      pending_approval: statusGroups.pending_approval?.length || 0,
      approved: statusGroups.approved?.length || 0,
      rejected: statusGroups.rejected?.length || 0,
      signed: statusGroups.signed?.length || 0,
      completed: statusGroups.completed?.length || 0
    }
  };
}

async function getContractsByDate(supabase: any, params: ReportParams) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      contract_value,
      client_name,
      created_at,
      creator:user_profiles!created_by(name)
    `)
    .gte('created_at', params.startDate || '2024-01-01')
    .lte('created_at', params.endDate || new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Agrupar por período
  const periodGroups = data.reduce((acc: any, contract: any) => {
    const date = new Date(contract.created_at);
    let key = '';
    
    switch (params.period) {
      case 'week':
        const week = getWeekNumber(date);
        key = `${date.getFullYear()}-W${week}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        key = `${date.getFullYear()}-Q${quarter}`;
        break;
      case 'year':
        key = `${date.getFullYear()}`;
        break;
      default:
        key = date.toISOString().split('T')[0];
    }
    
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(contract);
    return acc;
  }, {});

  return {
    type: 'contracts_by_date',
    generated_at: new Date().toISOString(),
    period: params.period,
    total_contracts: data.length,
    by_period: Object.keys(periodGroups).sort().map(period => ({
      period,
      count: periodGroups[period].length,
      total_value: periodGroups[period].reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0),
      contracts: periodGroups[period]
    }))
  };
}

async function getContractsByUser(supabase: any, params: ReportParams) {
  const query = supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      contract_value,
      client_name,
      created_at,
      created_by,
      creator:user_profiles!created_by(id, name, email, role)
    `)
    .order('created_at', { ascending: false });

  if (params.startDate) {
    query.gte('created_at', params.startDate);
  }
  if (params.endDate) {
    query.lte('created_at', params.endDate);
  }
  if (params.userId) {
    query.eq('created_by', params.userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Agrupar por usuario
  const userGroups = data.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    const userName = contract.creator?.name || 'Usuario desconocido';
    
    if (!acc[userId]) {
      acc[userId] = {
        user_id: userId,
        user_name: userName,
        user_email: contract.creator?.email,
        user_role: contract.creator?.role,
        contracts: [],
        total_value: 0,
        by_status: {}
      };
    }
    
    acc[userId].contracts.push(contract);
    acc[userId].total_value += contract.contract_value || 0;
    
    const status = contract.approval_status;
    acc[userId].by_status[status] = (acc[userId].by_status[status] || 0) + 1;
    
    return acc;
  }, {});

  return {
    type: 'contracts_by_user',
    generated_at: new Date().toISOString(),
    total_contracts: data.length,
    by_user: Object.values(userGroups).map((user: any) => ({
      ...user,
      contracts_count: user.contracts.length,
      average_value: user.contracts.length > 0 ? user.total_value / user.contracts.length : 0
    }))
  };
}

async function getContractsByValue(supabase: any, params: ReportParams) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      contract_value,
      client_name,
      created_at,
      creator:user_profiles!created_by(name)
    `)
    .not('contract_value', 'is', null)
    .order('contract_value', { ascending: false });

  if (error) throw error;

  const totalValue = data.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0);
  const averageValue = data.length > 0 ? totalValue / data.length : 0;

  // Rangos de valor
  const ranges = [
    { min: 0, max: 1000, label: '$0 - $1,000' },
    { min: 1000, max: 5000, label: '$1,000 - $5,000' },
    { min: 5000, max: 10000, label: '$5,000 - $10,000' },
    { min: 10000, max: 50000, label: '$10,000 - $50,000' },
    { min: 50000, max: Infinity, label: '$50,000+' }
  ];

  const valueRanges = ranges.map(range => {
    const contracts = data.filter((c: any) => 
      c.contract_value >= range.min && c.contract_value < range.max
    );
    return {
      range: range.label,
      count: contracts.length,
      total_value: contracts.reduce((sum: number, c: any) => sum + c.contract_value, 0),
      contracts
    };
  });

  return {
    type: 'contracts_by_value',
    generated_at: new Date().toISOString(),
    total_contracts: data.length,
    total_value: totalValue,
    average_value: averageValue,
    highest_value_contract: data[0],
    by_value_range: valueRanges,
    top_contracts: data.slice(0, 10)
  };
}

async function getContractsByTemplate(supabase: any, params: ReportParams) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      contract_value,
      template_id,
      created_at,
      template:contract_templates(id, title, category)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Agrupar por plantilla
  const templateGroups = data.reduce((acc: any, contract: any) => {
    const templateId = contract.template_id || 'no_template';
    const templateTitle = contract.template?.title || 'Sin plantilla';
    
    if (!acc[templateId]) {
      acc[templateId] = {
        template_id: templateId,
        template_title: templateTitle,
        template_category: contract.template?.category || 'N/A',
        contracts: [],
        total_value: 0,
        by_status: {}
      };
    }
    
    acc[templateId].contracts.push(contract);
    acc[templateId].total_value += contract.contract_value || 0;
    
    const status = contract.approval_status;
    acc[templateId].by_status[status] = (acc[templateId].by_status[status] || 0) + 1;
    
    return acc;
  }, {});

  return {
    type: 'contracts_by_template',
    generated_at: new Date().toISOString(),
    total_contracts: data.length,
    by_template: Object.values(templateGroups).map((template: any) => ({
      ...template,
      contracts_count: template.contracts.length,
      average_value: template.contracts.length > 0 ? template.total_value / template.contracts.length : 0,
      usage_percentage: (template.contracts.length / data.length) * 100
    }))
  };
}

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

function convertToCSV(data: any): string {
  if (!data.by_status && !data.by_period && !data.by_user && !data.by_template) {
    return 'No data available';
  }

  let csv = '';
  
  if (data.by_status) {
    csv += 'Status,Count,Total Value\n';
    data.by_status.forEach((item: any) => {
      csv += `${item.status},${item.count},${item.total_value}\n`;
    });
  } else if (data.by_period) {
    csv += 'Period,Count,Total Value\n';
    data.by_period.forEach((item: any) => {
      csv += `${item.period},${item.count},${item.total_value}\n`;
    });
  } else if (data.by_user) {
    csv += 'User Name,Email,Role,Contracts Count,Total Value\n';
    data.by_user.forEach((item: any) => {
      csv += `${item.user_name},${item.user_email},${item.user_role},${item.contracts_count},${item.total_value}\n`;
    });
  } else if (data.by_template) {
    csv += 'Template,Category,Usage Count,Total Value,Usage Percentage\n';
    data.by_template.forEach((item: any) => {
      csv += `${item.template_title},${item.template_category},${item.contracts_count},${item.total_value},${item.usage_percentage.toFixed(2)}%\n`;
    });
  }

  return csv;
}