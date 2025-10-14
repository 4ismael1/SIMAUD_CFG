import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface AnalyticsParams {
  type: 'dashboard' | 'trends' | 'performance' | 'overview';
  period: 'week' | 'month' | 'quarter' | 'year';
  startDate?: string;
  endDate?: string;
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
    const params: AnalyticsParams = {
      type: url.searchParams.get('type') as any || 'dashboard',
      period: url.searchParams.get('period') as any || 'month',
      startDate: url.searchParams.get('startDate') || undefined,
      endDate: url.searchParams.get('endDate') || undefined
    };

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let data: any = {};

    switch (params.type) {
      case 'dashboard':
        data = await getDashboardAnalytics(supabase, params);
        break;
      case 'trends':
        data = await getTrendsAnalytics(supabase, params);
        break;
      case 'performance':
        data = await getPerformanceAnalytics(supabase, params);
        break;
      case 'overview':
        data = await getSystemOverview(supabase, params);
        break;
      default:
        throw new Error('Tipo de analytics no válido');
    }

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error generating analytics:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error generando analytics' 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});

async function getDashboardAnalytics(supabase: any, params: AnalyticsParams) {
  const endDate = params.endDate || new Date().toISOString();
  const startDate = params.startDate || getDateAgo(30); // 30 días por defecto

  // Estadísticas principales
  const [contractsResult, usersResult, templatesResult, approvalsResult] = await Promise.all([
    // Contratos
    supabase.from('contracts').select('id, approval_status, contract_value, created_at'),
    // Usuarios
    supabase.from('user_profiles').select('id, role, created_at'),
    // Plantillas
    supabase.from('contract_templates').select('id, status, created_at'),
    // Aprobaciones
    supabase.from('contract_approvals').select('id, status, created_at')
  ]);

  const contracts = contractsResult.data || [];
  const users = usersResult.data || [];
  const templates = templatesResult.data || [];
  const approvals = approvalsResult.data || [];

  // Contratos del período actual
  const recentContracts = contracts.filter((c: any) => 
    new Date(c.created_at) >= new Date(startDate) && new Date(c.created_at) <= new Date(endDate)
  );

  return {
    type: 'dashboard_analytics',
    generated_at: new Date().toISOString(),
    period: `${startDate.split('T')[0]} to ${endDate.split('T')[0]}`,
    kpis: {
      total_contracts: contracts.length,
      total_users: users.length,
      total_templates: templates.length,
      pending_approvals: approvals.filter((a: any) => a.status === 'pending').length,
      contracts_this_period: recentContracts.length,
      total_contract_value: contracts.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0),
      approval_rate: calculateApprovalRate(contracts),
      average_contract_value: calculateAverageValue(contracts)
    },
    contract_status_distribution: getStatusDistribution(contracts),
    user_role_distribution: getRoleDistribution(users),
    recent_activity: recentContracts.slice(0, 10),
    top_performers: getTopPerformers(contracts, users)
  };
}

async function getTrendsAnalytics(supabase: any, params: AnalyticsParams) {
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, approval_status, contract_value, created_at, approved_at')
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Generar series de tiempo
  const timeSeriesData = generateTimeSeries(contracts, params.period);
  const approvalTrends = generateApprovalTrends(contracts, params.period);
  const valueTrends = generateValueTrends(contracts, params.period);

  return {
    type: 'trends_analytics',
    generated_at: new Date().toISOString(),
    period: params.period,
    contract_creation_trends: timeSeriesData,
    approval_time_trends: approvalTrends,
    contract_value_trends: valueTrends,
    growth_rate: calculateGrowthRate(timeSeriesData),
    seasonal_patterns: identifySeasonalPatterns(timeSeriesData)
  };
}

async function getPerformanceAnalytics(supabase: any, params: AnalyticsParams) {
  // Métricas de rendimiento del sistema
  const [contractsData, approvalsData, signaturesData] = await Promise.all([
    supabase.from('contracts').select('*'),
    supabase.from('contract_approvals').select('*'),
    supabase.from('contract_signatories').select('*')
  ]);

  const contracts = contractsData.data || [];
  const approvals = approvalsData.data || [];
  const signatures = signaturesData.data || [];

  return {
    type: 'performance_analytics',
    generated_at: new Date().toISOString(),
    metrics: {
      average_approval_time: calculateAverageApprovalTime(approvals),
      average_signing_time: calculateAverageSigningTime(signatures),
      contract_completion_rate: calculateCompletionRate(contracts),
      system_efficiency: calculateSystemEfficiency(contracts, approvals),
      bottlenecks: identifyBottlenecks(contracts, approvals),
      peak_hours: identifyPeakHours(contracts),
      template_effectiveness: calculateTemplateEffectiveness(contracts)
    }
  };
}

async function getSystemOverview(supabase: any, params: AnalyticsParams) {
  // Overview completo del sistema
  const [contractsData, usersData, templatesData, variablesData, approvalsData] = await Promise.all([
    supabase.from('contracts').select('*'),
    supabase.from('user_profiles').select('*'),
    supabase.from('contract_templates').select('*'),
    supabase.from('template_variables').select('*'),
    supabase.from('contract_approvals').select('*')
  ]);

  return {
    type: 'system_overview',
    generated_at: new Date().toISOString(),
    system_health: {
      total_entities: {
        contracts: contractsData.data?.length || 0,
        users: usersData.data?.length || 0,
        templates: templatesData.data?.length || 0,
        variables: variablesData.data?.length || 0,
        approvals: approvalsData.data?.length || 0
      },
      active_entities: {
        active_templates: templatesData.data?.filter((t: any) => t.status === 'active').length || 0,
        pending_approvals: approvalsData.data?.filter((a: any) => a.status === 'pending').length || 0,
        active_contracts: contractsData.data?.filter((c: any) => c.status === 'active').length || 0
      },
      system_utilization: calculateSystemUtilization(contractsData.data, templatesData.data, usersData.data)
    }
  };
}

// Funciones auxiliares
function getDateAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function calculateApprovalRate(contracts: any[]): number {
  const approvedContracts = contracts.filter(c => c.approval_status === 'approved').length;
  return contracts.length > 0 ? (approvedContracts / contracts.length) * 100 : 0;
}

function calculateAverageValue(contracts: any[]): number {
  const contractsWithValue = contracts.filter(c => c.contract_value);
  const totalValue = contractsWithValue.reduce((sum, c) => sum + c.contract_value, 0);
  return contractsWithValue.length > 0 ? totalValue / contractsWithValue.length : 0;
}

function getStatusDistribution(contracts: any[]) {
  return contracts.reduce((acc: any, contract: any) => {
    const status = contract.approval_status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function getRoleDistribution(users: any[]) {
  return users.reduce((acc: any, user: any) => {
    const role = user.role;
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
}

function getTopPerformers(contracts: any[], users: any[]) {
  const userStats = contracts.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    if (!acc[userId]) {
      acc[userId] = { contracts: 0, value: 0 };
    }
    acc[userId].contracts++;
    acc[userId].value += contract.contract_value || 0;
    return acc;
  }, {});

  return Object.entries(userStats)
    .map(([userId, stats]: [string, any]) => ({
      user_id: userId,
      user_name: users.find(u => u.id === userId)?.name || 'Desconocido',
      contracts_count: stats.contracts,
      total_value: stats.value
    }))
    .sort((a, b) => b.contracts_count - a.contracts_count)
    .slice(0, 5);
}

function generateTimeSeries(contracts: any[], period: string) {
  // Implementación simplificada para generar series de tiempo
  return contracts.reduce((acc: any, contract: any) => {
    const date = new Date(contract.created_at);
    let key = '';
    
    switch (period) {
      case 'week':
        key = `${date.getFullYear()}-W${Math.ceil(date.getDate()/7)}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'quarter':
        key = `${date.getFullYear()}-Q${Math.floor(date.getMonth()/3) + 1}`;
        break;
      case 'year':
        key = `${date.getFullYear()}`;
        break;
    }
    
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function generateApprovalTrends(contracts: any[], period: string) {
  return contracts
    .filter(c => c.approved_at)
    .reduce((acc: any, contract: any) => {
      const createdDate = new Date(contract.created_at);
      const approvedDate = new Date(contract.approved_at);
      const timeDiff = approvedDate.getTime() - createdDate.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
      
      const key = `${approvedDate.getFullYear()}-${String(approvedDate.getMonth() + 1).padStart(2, '0')}`;
      if (!acc[key]) {
        acc[key] = { total_time: 0, count: 0 };
      }
      acc[key].total_time += daysDiff;
      acc[key].count++;
      
      return acc;
    }, {});
}

function generateValueTrends(contracts: any[], period: string) {
  return contracts
    .filter(c => c.contract_value)
    .reduce((acc: any, contract: any) => {
      const date = new Date(contract.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!acc[key]) {
        acc[key] = { total_value: 0, count: 0 };
      }
      acc[key].total_value += contract.contract_value;
      acc[key].count++;
      
      return acc;
    }, {});
}

function calculateGrowthRate(timeSeriesData: any): number {
  const periods = Object.keys(timeSeriesData).sort();
  if (periods.length < 2) return 0;
  
  const firstPeriod = timeSeriesData[periods[0]];
  const lastPeriod = timeSeriesData[periods[periods.length - 1]];
  
  return ((lastPeriod - firstPeriod) / firstPeriod) * 100;
}

function identifySeasonalPatterns(timeSeriesData: any) {
  // Análisis básico de patrones estacionales
  const monthlyData: any = {};
  
  Object.entries(timeSeriesData).forEach(([key, value]: [string, any]) => {
    if (key.includes('-')) {
      const month = key.split('-')[1];
      monthlyData[month] = (monthlyData[month] || 0) + value;
    }
  });
  
  return monthlyData;
}

function calculateAverageApprovalTime(approvals: any[]): number {
  const completedApprovals = approvals.filter(a => a.reviewed_at && a.requested_at);
  if (completedApprovals.length === 0) return 0;
  
  const totalTime = completedApprovals.reduce((sum, approval) => {
    const requestTime = new Date(approval.requested_at).getTime();
    const reviewTime = new Date(approval.reviewed_at).getTime();
    return sum + (reviewTime - requestTime);
  }, 0);
  
  return totalTime / completedApprovals.length / (1000 * 3600 * 24); // días
}

function calculateAverageSigningTime(signatures: any[]): number {
  const signedContracts = signatures.filter(s => s.signed_at);
  if (signedContracts.length === 0) return 0;
  
  // Simplificado: tiempo desde creación hasta firma
  return 2.5; // días promedio (placeholder)
}

function calculateCompletionRate(contracts: any[]): number {
  const completedContracts = contracts.filter(c => c.approval_status === 'completed').length;
  return contracts.length > 0 ? (completedContracts / contracts.length) * 100 : 0;
}

function calculateSystemEfficiency(contracts: any[], approvals: any[]): number {
  const totalProcessed = contracts.filter(c => c.approval_status !== 'draft').length;
  const totalCreated = contracts.length;
  return totalCreated > 0 ? (totalProcessed / totalCreated) * 100 : 0;
}

function identifyBottlenecks(contracts: any[], approvals: any[]) {
  const pendingApprovals = approvals.filter(a => a.status === 'pending').length;
  const draftContracts = contracts.filter(c => c.approval_status === 'draft').length;
  const rejectedContracts = contracts.filter(c => c.approval_status === 'rejected').length;
  
  return {
    pending_approvals: pendingApprovals,
    draft_contracts: draftContracts,
    rejected_contracts: rejectedContracts,
    main_bottleneck: pendingApprovals > draftContracts ? 'approvals' : 'creation'
  };
}

function identifyPeakHours(contracts: any[]) {
  const hourStats: any = {};
  
  contracts.forEach(contract => {
    const hour = new Date(contract.created_at).getHours();
    hourStats[hour] = (hourStats[hour] || 0) + 1;
  });
  
  const peakHour = Object.entries(hourStats)
    .sort(([,a]: any, [,b]: any) => b - a)[0];
  
  return {
    peak_hour: peakHour ? parseInt(peakHour[0]) : 14,
    peak_count: peakHour ? peakHour[1] : 0,
    hourly_distribution: hourStats
  };
}

function calculateTemplateEffectiveness(contracts: any[]) {
  const templateStats = contracts.reduce((acc: any, contract: any) => {
    const templateId = contract.template_id || 'no_template';
    if (!acc[templateId]) {
      acc[templateId] = { total: 0, approved: 0 };
    }
    acc[templateId].total++;
    if (contract.approval_status === 'approved') {
      acc[templateId].approved++;
    }
    return acc;
  }, {});
  
  return Object.entries(templateStats).map(([templateId, stats]: [string, any]) => ({
    template_id: templateId,
    effectiveness_rate: stats.total > 0 ? (stats.approved / stats.total) * 100 : 0,
    total_usage: stats.total,
    approved_count: stats.approved
  }));
}

function calculateSystemUtilization(contracts: any[], templates: any[], users: any[]) {
  const activeTemplates = templates?.filter(t => t.status === 'active').length || 0;
  const totalTemplates = templates?.length || 1;
  const activeUsers = users?.filter(u => {
    // Usuario activo si ha creado al menos un contrato en los últimos 30 días
    const thirtyDaysAgo = getDateAgo(30);
    return contracts?.some(c => c.created_by === u.id && c.created_at >= thirtyDaysAgo);
  }).length || 0;
  const totalUsers = users?.length || 1;
  
  return {
    template_utilization: (activeTemplates / totalTemplates) * 100,
    user_engagement: (activeUsers / totalUsers) * 100,
    system_load: contracts?.length || 0,
    efficiency_score: calculateEfficiencyScore(contracts)
  };
}

function calculateEfficiencyScore(contracts: any[]): number {
  if (!contracts || contracts.length === 0) return 0;
  
  const weights = {
    approved: 1.0,
    signed: 0.9,
    completed: 1.2,
    pending_approval: 0.5,
    rejected: -0.2,
    draft: 0.1
  };
  
  const totalScore = contracts.reduce((sum, contract) => {
    const weight = weights[contract.approval_status as keyof typeof weights] || 0;
    return sum + weight;
  }, 0);
  
  return (totalScore / contracts.length) * 100;
}