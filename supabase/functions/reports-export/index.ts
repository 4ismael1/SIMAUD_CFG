import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface ExportParams {
  reportType: 'contracts' | 'users' | 'analytics';
  format: 'pdf' | 'excel' | 'csv' | 'json';
  data?: any;
  filters?: any;
  template?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    let params: ExportParams;
    
    if (req.method === 'POST') {
      params = await req.json();
    } else {
      const url = new URL(req.url);
      params = {
        reportType: url.searchParams.get('reportType') as any || 'contracts',
        format: url.searchParams.get('format') as any || 'json',
        template: url.searchParams.get('template') || undefined
      };
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let exportData: any;
    let filename: string;

    switch (params.reportType) {
      case 'contracts':
        exportData = await exportContractsData(supabase, params);
        filename = `contratos-${new Date().toISOString().split('T')[0]}`;
        break;
      case 'users':
        exportData = await exportUsersData(supabase, params);
        filename = `usuarios-${new Date().toISOString().split('T')[0]}`;
        break;
      case 'analytics':
        exportData = await exportAnalyticsData(supabase, params);
        filename = `analytics-${new Date().toISOString().split('T')[0]}`;
        break;
      default:
        throw new Error('Tipo de reporte no válido para exportación');
    }

    switch (params.format) {
      case 'csv':
        const csv = convertToCSV(exportData, params.reportType);
        return new Response(csv, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}.csv"`
          }
        });
      
      case 'excel':
        // Para Excel, retornamos CSV mejorado con formato
        const excelCsv = convertToExcelCSV(exportData, params.reportType);
        return new Response(excelCsv, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/vnd.ms-excel',
            'Content-Disposition': `attachment; filename="${filename}.xls"`
          }
        });
      
      case 'pdf':
        // Para PDF, generamos HTML que se puede convertir
        const pdfHtml = generatePDFHTML(exportData, params);
        return new Response(JSON.stringify({
          html: pdfHtml,
          filename: `${filename}.pdf`,
          success: true
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      
      case 'json':
      default:
        return new Response(JSON.stringify({
          data: exportData,
          filename: `${filename}.json`,
          generated_at: new Date().toISOString(),
          success: true
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
    }

  } catch (error) {
    console.error('Error exporting data:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error exportando datos',
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

async function exportContractsData(supabase: any, params: ExportParams) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id,
      title,
      approval_status,
      status,
      contract_value,
      client_name,
      client_email,
      client_phone,
      start_date,
      end_date,
      created_at,
      updated_at,
      approved_at,
      current_version,
      notes,
      creator:user_profiles!created_by(name, email, role),
      template:contract_templates(title, category)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    title: 'Reporte de Contratos',
    generated_at: new Date().toISOString(),
    total_records: data.length,
    contracts: data.map((contract: any) => ({
      id: contract.id,
      titulo: contract.title,
      estado_aprobacion: contract.approval_status,
      estado_contrato: contract.status,
      valor: contract.contract_value,
      cliente: contract.client_name,
      email_cliente: contract.client_email,
      telefono_cliente: contract.client_phone,
      fecha_inicio: contract.start_date,
      fecha_fin: contract.end_date,
      fecha_creacion: new Date(contract.created_at).toLocaleDateString('es-ES'),
      fecha_actualizacion: new Date(contract.updated_at).toLocaleDateString('es-ES'),
      fecha_aprobacion: contract.approved_at ? new Date(contract.approved_at).toLocaleDateString('es-ES') : '',
      version_actual: contract.current_version,
      creado_por: contract.creator?.name || 'Desconocido',
      email_creador: contract.creator?.email || '',
      rol_creador: contract.creator?.role || '',
      plantilla: contract.template?.title || 'Sin plantilla',
      categoria_plantilla: contract.template?.category || '',
      notas: contract.notes || ''
    }))
  };
}

async function exportUsersData(supabase: any, params: ExportParams) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return {
    title: 'Reporte de Usuarios',
    generated_at: new Date().toISOString(),
    total_records: data.length,
    users: data.map((user: any) => ({
      id: user.id,
      nombre: user.name,
      email: user.email,
      telefono: user.phone,
      cedula: user.cedula,
      rol: user.role,
      fecha_registro: new Date(user.created_at).toLocaleDateString('es-ES'),
      ultima_actualizacion: new Date(user.updated_at).toLocaleDateString('es-ES')
    }))
  };
}

async function exportAnalyticsData(supabase: any, params: ExportParams) {
  // Obtener datos básicos para analytics
  const [contractsData, usersData, templatesData] = await Promise.all([
    supabase.from('contracts').select('*'),
    supabase.from('user_profiles').select('*'),
    supabase.from('contract_templates').select('*')
  ]);

  const contracts = contractsData.data || [];
  const users = usersData.data || [];
  const templates = templatesData.data || [];

  return {
    title: 'Reporte de Analytics',
    generated_at: new Date().toISOString(),
    summary: {
      total_contracts: contracts.length,
      total_users: users.length,
      total_templates: templates.length,
      contracts_by_status: getStatusBreakdown(contracts),
      users_by_role: getRoleBreakdown(users),
      total_contract_value: contracts.reduce((sum: number, c: any) => sum + (c.contract_value || 0), 0)
    },
    details: {
      contracts_monthly: getMonthlyBreakdown(contracts),
      template_usage: getTemplateUsage(contracts, templates),
      user_productivity: getUserProductivityData(contracts, users)
    }
  };
}

function convertToCSV(data: any, reportType: string): string {
  switch (reportType) {
    case 'contracts':
      return convertContractsToCSV(data);
    case 'users':
      return convertUsersToCSV(data);
    case 'analytics':
      return convertAnalyticsToCSV(data);
    default:
      return 'Report type,Value\nNo data,0';
  }
}

function convertContractsToCSV(data: any): string {
  if (!data.contracts || data.contracts.length === 0) {
    return 'No hay datos de contratos disponibles';
  }

  const headers = [
    'ID', 'Título', 'Estado Aprobación', 'Estado Contrato', 'Valor', 'Cliente',
    'Email Cliente', 'Teléfono Cliente', 'Fecha Inicio', 'Fecha Fin',
    'Fecha Creación', 'Creado Por', 'Plantilla', 'Notas'
  ].join(',');

  const rows = data.contracts.map((contract: any) => [
    contract.id,
    `"${contract.titulo}"`,
    contract.estado_aprobacion,
    contract.estado_contrato,
    contract.valor || 0,
    `"${contract.cliente}"`,
    contract.email_cliente,
    contract.telefono_cliente,
    contract.fecha_inicio,
    contract.fecha_fin,
    contract.fecha_creacion,
    `"${contract.creado_por}"`,
    `"${contract.plantilla}"`,
    `"${contract.notas}"`
  ].join(','));

  return headers + '\n' + rows.join('\n');
}

function convertUsersToCSV(data: any): string {
  if (!data.users || data.users.length === 0) {
    return 'No hay datos de usuarios disponibles';
  }

  const headers = ['ID', 'Nombre', 'Email', 'Teléfono', 'Cédula', 'Rol', 'Fecha Registro'].join(',');
  
  const rows = data.users.map((user: any) => [
    user.id,
    `"${user.nombre}"`,
    user.email,
    user.telefono,
    user.cedula,
    user.rol,
    user.fecha_registro
  ].join(','));

  return headers + '\n' + rows.join('\n');
}

function convertAnalyticsToCSV(data: any): string {
  let csv = 'Métrica,Valor\n';
  csv += `Total Contratos,${data.summary.total_contracts}\n`;
  csv += `Total Usuarios,${data.summary.total_users}\n`;
  csv += `Total Plantillas,${data.summary.total_templates}\n`;
  csv += `Valor Total Contratos,${data.summary.total_contract_value}\n`;
  return csv;
}

function convertToExcelCSV(data: any, reportType: string): string {
  // Versión mejorada del CSV con formato Excel
  return convertToCSV(data, reportType);
}

function generatePDFHTML(data: any, params: ExportParams): string {
  const date = new Date().toLocaleDateString('es-ES');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Reporte SIMAUD - ${data.title}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
        .title { color: #1f2937; font-size: 24px; margin-bottom: 10px; }
        .subtitle { color: #6b7280; font-size: 14px; }
        .section { margin-bottom: 30px; }
        .section-title { color: #1f2937; font-size: 18px; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
        th { background-color: #f9fafb; font-weight: 600; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
        .summary-card { background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .metric-value { font-size: 24px; font-weight: bold; color: #3b82f6; }
        .metric-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${data.title}</div>
        <div class="subtitle">Generado el ${date} | Sistema SIMAUD</div>
      </div>
      
      <div class="section">
        <div class="section-title">Resumen Ejecutivo</div>
        <div class="summary-grid">
          ${generateSummaryCards(data)}
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">Datos Detallados</div>
        ${generateDataTable(data, params.reportType)}
      </div>
      
      <div style="margin-top: 40px; text-align: center; color: #6b7280; font-size: 12px;">
        <p>Este reporte fue generado automáticamente por SIMAUD el ${new Date().toLocaleString('es-ES')}</p>
      </div>
    </body>
    </html>
  `;
}

function generateSummaryCards(data: any): string {
  let cards = '';
  
  if (data.summary) {
    Object.entries(data.summary).forEach(([key, value]: [string, any]) => {
      cards += `
        <div class="summary-card">
          <div class="metric-value">${typeof value === 'number' ? value.toLocaleString('es-ES') : value}</div>
          <div class="metric-label">${formatMetricLabel(key)}</div>
        </div>
      `;
    });
  }
  
  return cards;
}

function generateDataTable(data: any, reportType: string): string {
  if (reportType === 'contracts' && data.contracts) {
    return `
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Valor</th>
            <th>Fecha Creación</th>
            <th>Creado Por</th>
          </tr>
        </thead>
        <tbody>
          ${data.contracts.slice(0, 50).map((contract: any) => `
            <tr>
              <td>${contract.titulo}</td>
              <td>${contract.cliente}</td>
              <td>${contract.estado_aprobacion}</td>
              <td>$${(contract.valor || 0).toLocaleString('es-ES')}</td>
              <td>${contract.fecha_creacion}</td>
              <td>${contract.creado_por}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  if (reportType === 'users' && data.users) {
    return `
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Cédula</th>
            <th>Fecha Registro</th>
          </tr>
        </thead>
        <tbody>
          ${data.users.slice(0, 50).map((user: any) => `
            <tr>
              <td>${user.nombre}</td>
              <td>${user.email}</td>
              <td>${user.rol}</td>
              <td>${user.cedula}</td>
              <td>${user.fecha_registro}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
  
  return '<p>No hay datos detallados disponibles para este tipo de reporte.</p>';
}

function formatMetricLabel(key: string): string {
  const labels: { [key: string]: string } = {
    total_contracts: 'Total Contratos',
    total_users: 'Total Usuarios',
    total_templates: 'Total Plantillas',
    total_contract_value: 'Valor Total Contratos',
    pending_approvals: 'Aprobaciones Pendientes',
    approval_rate: 'Tasa de Aprobación (%)',
    average_contract_value: 'Valor Promedio'
  };
  
  return labels[key] || key.replace(/_/g, ' ').toUpperCase();
}

function getStatusBreakdown(contracts: any[]) {
  return contracts.reduce((acc: any, contract: any) => {
    const status = contract.approval_status;
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

function getRoleBreakdown(users: any[]) {
  return users.reduce((acc: any, user: any) => {
    const role = user.role;
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {});
}

function getMonthlyBreakdown(contracts: any[]) {
  return contracts.reduce((acc: any, contract: any) => {
    const date = new Date(contract.created_at);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    acc[month] = (acc[month] || 0) + 1;
    return acc;
  }, {});
}

function getTemplateUsage(contracts: any[], templates: any[]) {
  const usage = contracts.reduce((acc: any, contract: any) => {
    const templateId = contract.template_id || 'no_template';
    acc[templateId] = (acc[templateId] || 0) + 1;
    return acc;
  }, {});
  
  return templates.map(template => ({
    template_id: template.id,
    title: template.title,
    usage_count: usage[template.id] || 0
  }));
}

function getUserProductivityData(contracts: any[], users: any[]) {
  const productivity = contracts.reduce((acc: any, contract: any) => {
    const userId = contract.created_by;
    if (!acc[userId]) {
      acc[userId] = { contracts: 0, value: 0 };
    }
    acc[userId].contracts++;
    acc[userId].value += contract.contract_value || 0;
    return acc;
  }, {});
  
  return users.map(user => ({
    user_id: user.id,
    name: user.name,
    role: user.role,
    contracts_created: productivity[user.id]?.contracts || 0,
    total_value: productivity[user.id]?.value || 0
  }));
}