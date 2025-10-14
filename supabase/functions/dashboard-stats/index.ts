import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface DashboardParams {
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  userId?: string;
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
    const params: DashboardParams = {
      role: url.searchParams.get('role') as any || 'admin',
      userId: url.searchParams.get('userId') || undefined,
      period: url.searchParams.get('period') as any || 'month'
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data: any = {};

    switch (params.role) {
      case 'admin':
        data = await getAdminDashboardData(supabase, params);
        break;
      case 'supervisor':
        data = await getSupervisorDashboardData(supabase, params);
        break;
      case 'gestor':
        data = await getGestorDashboardData(supabase, params);
        break;
      case 'user':
        data = await getUserDashboardData(supabase, params);
        break;
      default:
        throw new Error('Rol no válido');
    }

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error generating dashboard data:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generando datos del dashboard' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

async function getAdminDashboardData(supabase: any, params: DashboardParams) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Obtener todos los datos en paralelo
  const [
    contractsResult,
    usersResult,
    templatesResult,
    approvalsResult,
    signatoriesResult
  ] = await Promise.all([
    supabase.from('contracts').select('*'),
    supabase.from('user_profiles').select('*'),
    supabase.from('contract_templates').select('*'),
    supabase.from('contract_approvals').select('*'),
    supabase.from('contract_signatories').select('*')
  ]);

  const contracts = contractsResult.data || [];
  const users = usersResult.data || [];
  const templates = templatesResult.data || [];
  const approvals = approvalsResult.data || [];
  const signatories = signatoriesResult.data || [];

  // Calcular estadísticas
  const totalValue = contracts.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0);
  const recentContracts = contracts.filter((c: any) => c.created_at >= thirtyDaysAgo);
  const recentUsers = users.filter((u: any) => u.created_at >= thirtyDaysAgo);
  const pendingApprovals = approvals.filter((a: any) => a.status === 'pending');
  const weeklyContracts = contracts.filter((c: any) => c.created_at >= sevenDaysAgo);

  // Calculate active contracts
  const activeContracts = contracts.filter((c: any) => c.status === 'active').length;
  const expiringSoonContracts = contracts.filter((c: any) => c.actual_status === 'expiring_soon').length;

  // Distribución por estado
  const statusDistribution = contracts.reduce((acc: any, contract: any) => {
    const status = contract.approval_status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  // Distribución por rol
  const roleDistribution = users.reduce((acc: any, user: any) => {
    const role = user.role;
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});

  // Contratos por mes (últimos 6 meses)
  const contractsByMonth = getContractsByMonth(contracts, 6);
  
  // Top gestores
  const topGestores = getTopGestores(contracts, users);

  // Actividad reciente
  const recentActivity = contracts
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((c: any) => ({
      id: c.id,
      title: c.title,
      client_name: c.client_name,
      approval_status: c.approval_status,
      created_at: c.created_at,
      contract_value: c.contract_value
    }));

  return {
    role: 'admin',
    generated_at: new Date().toISOString(),
    stats: {
      total_users: users.length,
      new_users_month: recentUsers.length,
      total_contracts: contracts.length,
      new_contracts_month: recentContracts.length,
      total_value: totalValue,
      pending_approvals: pendingApprovals.length,
      active_contracts: activeContracts,
      expiring_soon: expiringSoonContracts,
      active_templates: templates.filter((t: any) => t.status === 'active').length,
      contracts_this_week: weeklyContracts.length
    },
    charts: {
      contracts_by_month: contractsByMonth,
      status_distribution: statusDistribution,
      role_distribution: roleDistribution,
      value_trend: generateValueTrend(contracts),
      approval_time_trend: generateApprovalTimeTrend(contracts, approvals)
    },
    recent_activity: recentActivity,
    top_gestores: topGestores,
    quick_stats: {
      approval_rate: calculateApprovalRate(contracts),
      average_contract_value: totalValue / (contracts.length || 1),
      avg_approval_time: calculateAverageApprovalTime(contracts, approvals),
      system_efficiency: calculateSystemEfficiency(contracts)
    }
  };
}

async function getSupervisorDashboardData(supabase: any, params: DashboardParams) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    templatesResult,
    variablesResult,
    contractsResult,
    approvalsResult
  ] = await Promise.all([
    supabase.from('contract_templates').select('*'),
    supabase.from('template_variables').select('*'),
    supabase.from('contracts').select('*'),
    supabase.from('contract_approvals').select('*')
  ]);

  const templates = templatesResult.data || [];
  const variables = variablesResult.data || [];
  const contracts = contractsResult.data || [];
  const approvals = approvalsResult.data || [];

  const activeTemplates = templates.filter((t: any) => t.status === 'active');
  const recentTemplates = templates.filter((t: any) => t.created_at >= thirtyDaysAgo);
  const pendingApprovals = approvals.filter((a: any) => a.status === 'pending');

  // Uso de plantillas
  const templateUsage = getTemplateUsage(contracts, templates);
  
  // Variables más usadas
  const variableUsage = getVariableUsage(contracts, variables);

  return {
    role: 'supervisor',
    generated_at: new Date().toISOString(),
    stats: {
      total_templates: templates.length,
      active_templates: activeTemplates.length,
      new_templates_month: recentTemplates.length,
      total_variables: variables.length,
      contracts_generated: contracts.length,
      pending_approvals: pendingApprovals.length,
      template_utilization: (activeTemplates.length / templates.length) * 100,
      avg_approval_time: calculateAverageApprovalTime(contracts, approvals)
    },
    charts: {
      template_usage: templateUsage,
      variable_usage: variableUsage.slice(0, 10),
      approval_trends: generateApprovalTrends(approvals),
      template_categories: getTemplateCategoryDistribution(templates)
    },
    recent_templates: templates.slice(0, 5),
    pending_approvals_list: pendingApprovals.slice(0, 5)
  };
}

async function getGestorDashboardData(supabase: any, params: DashboardParams) {
  const userId = params.userId;
  if (!userId) {
    throw new Error('userId is required for gestor dashboard');
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Obtener contratos del gestor
  const { data: contracts, error: contractsError } = await supabase
    .from('contracts')
    .select(`
      *,
      template:contract_templates(title, category)
    `)
    .eq('created_by', userId);

  if (contractsError) throw contractsError;

  const recentContracts = contracts.filter((c: any) => c.created_at >= thirtyDaysAgo);
  const weeklyContracts = contracts.filter((c: any) => c.created_at >= sevenDaysAgo);

  // Estadísticas por estado
  const statusStats = contracts.reduce((acc: any, contract: any) => {
    const status = contract.approval_status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  // Valor total de contratos
  const totalValue = contracts.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0);

  return {
    role: 'gestor',
    generated_at: new Date().toISOString(),
    user_id: userId,
    stats: {
      total_contracts: contracts.length,
      new_contracts_month: recentContracts.length,
      contracts_this_week: weeklyContracts.length,
      draft_contracts: statusStats.draft || 0,
      pending_approval: statusStats.pending_approval || 0,
      approved_contracts: statusStats.approved || 0,
      rejected_contracts: statusStats.rejected || 0,
      signed_contracts: statusStats.signed || 0,
      completed_contracts: statusStats.completed || 0,
      expired_contracts: contracts.filter((c: any) => c.actual_status === 'expired').length,
      expiring_soon_contracts: contracts.filter((c: any) => c.actual_status === 'expiring_soon').length,
      total_value: totalValue,
      approval_rate: calculateApprovalRate(contracts),
      avg_contract_value: totalValue / (contracts.length || 1)
    },
    charts: {
      status_distribution: statusStats,
      contracts_by_month: getContractsByMonth(contracts, 6),
      value_trend: generateValueTrend(contracts),
      template_usage: getTemplateUsage(contracts, [])
    },
    recent_contracts: contracts
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  };
}

async function getUserDashboardData(supabase: any, params: DashboardParams) {
  const userId = params.userId;
  if (!userId) {
    throw new Error('userId is required for user dashboard');
  }

  // Obtener contratos donde el usuario es firmante
  const { data: signatories, error: signatoriesError } = await supabase
    .from('contract_signatories')
    .select(`
      *,
      contract:contracts(*)
    `)
    .eq('user_id', userId);

  if (signatoriesError) throw signatoriesError;

  const contracts = signatories.map((s: any) => s.contract).filter((c: any) => c);
  const pendingSignatures = signatories.filter((s: any) => !s.signed_at);
  const completedSignatures = signatories.filter((s: any) => s.signed_at);

  return {
    role: 'user',
    generated_at: new Date().toISOString(),
    user_id: userId,
    stats: {
      total_contracts: contracts.length,
      pending_signatures: pendingSignatures.length,
      completed_signatures: completedSignatures.length,
      contracts_this_month: contracts.filter((c: any) => 
        new Date(c.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length
    },
    recent_contracts: contracts.slice(0, 5),
    pending_signatures: pendingSignatures.slice(0, 3)
  };
}

// Funciones auxiliares
function getContractsByMonth(contracts: any[], months: number) {
  const result: any = {};
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    result[monthKey] = 0;
  }
  
  contracts.forEach((contract: any) => {
    const date = new Date(contract.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (result.hasOwnProperty(monthKey)) {
      result[monthKey]++;
    }
  });
  
  return result;
}

function getTopGestores(contracts: any[], users: any[]) {
  const gestorStats = contracts.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    if (!acc[userId]) {
      acc[userId] = { contracts: 0, value: 0 };
    }
    acc[userId].contracts++;
    acc[userId].value += contract.contract_value || 0;
    return acc;
  }, {});

  return Object.entries(gestorStats)
    .map(([userId, stats]: [string, any]) => ({
      user_id: userId,
      user_name: users.find((u: any) => u.id === userId)?.name || 'Desconocido',
      contracts_count: stats.contracts,
      total_value: stats.value
    }))
    .sort((a, b) => b.contracts_count - a.contracts_count)
    .slice(0, 5);
}

function getTemplateUsage(contracts: any[], templates: any[]) {
  const usage = contracts.reduce((acc: any, contract: any) => {
    const templateId = contract.template_id || 'no_template';
    acc[templateId] = (acc[templateId] || 0) + 1;
    return acc;
  }, {});
  
  return Object.entries(usage)
    .map(([templateId, count]: [string, any]) => ({
      template_id: templateId,
      template_name: templates.find((t: any) => t.id === templateId)?.title || 'Sin plantilla',
      usage_count: count,
      percentage: (count / contracts.length) * 100
    }))
    .sort((a, b) => b.usage_count - a.usage_count);
}

function getVariableUsage(contracts: any[], variables: any[]) {
  const variableCount: any = {};
  
  contracts.forEach((contract: any) => {
    if (contract.variables_data) {
      Object.keys(contract.variables_data).forEach(varName => {
        variableCount[varName] = (variableCount[varName] || 0) + 1;
      });
    }
  });
  
  return Object.entries(variableCount)
    .map(([varName, count]: [string, any]) => ({
      variable_name: varName,
      variable_label: variables.find((v: any) => v.name === varName)?.label || varName,
      usage_count: count,
      percentage: (count / contracts.length) * 100
    }))
    .sort((a, b) => b.usage_count - a.usage_count);
}

function generateValueTrend(contracts: any[]) {
  const monthlyValues: any = {};
  
  contracts.forEach((contract: any) => {
    if (contract.contract_value) {
      const date = new Date(contract.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyValues[monthKey] = (monthlyValues[monthKey] || 0) + contract.contract_value;
    }
  });
  
  return monthlyValues;
}

function generateApprovalTimeTrend(contracts: any[], approvals: any[]) {
  const monthlyTimes: any = {};
  
  approvals.forEach((approval: any) => {
    if (approval.reviewed_at && approval.requested_at) {
      const requestTime = new Date(approval.requested_at);
      const reviewTime = new Date(approval.reviewed_at);
      const timeDiff = (reviewTime.getTime() - requestTime.getTime()) / (1000 * 3600 * 24); // días
      
      const monthKey = `${reviewTime.getFullYear()}-${String(reviewTime.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyTimes[monthKey]) {
        monthlyTimes[monthKey] = { total: 0, count: 0 };
      }
      monthlyTimes[monthKey].total += timeDiff;
      monthlyTimes[monthKey].count++;
    }
  });
  
  // Calcular promedios
  Object.keys(monthlyTimes).forEach(month => {
    monthlyTimes[month] = monthlyTimes[month].total / monthlyTimes[month].count;
  });
  
  return monthlyTimes;
}

function generateApprovalTrends(approvals: any[]) {
  const monthlyApprovals: any = {};
  
  approvals.forEach((approval: any) => {
    const date = new Date(approval.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthlyApprovals[monthKey]) {
      monthlyApprovals[monthKey] = { pending: 0, approved: 0, rejected: 0 };
    }
    monthlyApprovals[monthKey][approval.status]++;
  });
  
  return monthlyApprovals;
}

function getTemplateCategoryDistribution(templates: any[]) {
  return templates.reduce((acc: any, template: any) => {
    const category = template.category;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
}

function calculateApprovalRate(contracts: any[]): number {
  const approvedContracts = contracts.filter((c: any) => c.approval_status === 'approved').length;
  return contracts.length > 0 ? (approvedContracts / contracts.length) * 100 : 0;
}

function calculateAverageApprovalTime(contracts: any[], approvals: any[]): number {
  const completedApprovals = approvals.filter((a: any) => a.reviewed_at && a.requested_at);
  if (completedApprovals.length === 0) return 0;
  
  const totalTime = completedApprovals.reduce((sum: number, approval: any) => {
    const requestTime = new Date(approval.requested_at).getTime();
    const reviewTime = new Date(approval.reviewed_at).getTime();
    return sum + (reviewTime - requestTime);
  }, 0);
  
  return totalTime / completedApprovals.length / (1000 * 3600 * 24); // días
}

function calculateSystemEfficiency(contracts: any[]): number {
  const processedContracts = contracts.filter((c: any) => 
    ['approved', 'signed', 'completed'].includes(c.approval_status)
  ).length;
  return contracts.length > 0 ? (processedContracts / contracts.length) * 100 : 0;
}