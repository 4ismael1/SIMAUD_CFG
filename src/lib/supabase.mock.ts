// DEV ONLY — fake Supabase client used to review the UI without a backend.
// Enabled with VITE_UI_MOCK=1. Role is chosen with ?mockRole=admin|supervisor|gestor|user (persisted).
/* eslint-disable @typescript-eslint/no-explicit-any */

const params = new URLSearchParams(window.location.search);
const fromUrl = params.get('mockRole');
if (fromUrl === 'none') localStorage.removeItem('mock_role');
else if (fromUrl) localStorage.setItem('mock_role', fromUrl);
const role = localStorage.getItem('mock_role') as 'admin' | 'supervisor' | 'gestor' | 'user' | null;

const now = Date.now();
const day = 86400000;
const iso = (d: number) => new Date(now + d * day).toISOString();
const date = (d: number) => iso(d).slice(0, 10);

const users = [
  { id: 'u-admin', email: 'admin@simaud.do', name: 'Ana Ureña', phone: '809-555-0101', cedula: '001-1234567-8', role: 'admin', avatar_url: null, created_at: iso(-200), updated_at: iso(-3) },
  { id: 'u-sup', email: 'supervisor@simaud.do', name: 'Carlos Méndez', phone: '809-555-0102', cedula: '001-2345678-9', role: 'supervisor', avatar_url: null, created_at: iso(-150), updated_at: iso(-5) },
  { id: 'u-ges', email: 'gestor@simaud.do', name: 'María Fernández', phone: '809-555-0103', cedula: '402-3456789-0', role: 'gestor', avatar_url: null, created_at: iso(-120), updated_at: iso(-2) },
  { id: 'u-user', email: 'usuario@simaud.do', name: 'José Rodríguez Peña', phone: '829-555-0104', cedula: '031-4567890-1', role: 'user', avatar_url: null, created_at: iso(-60), updated_at: iso(-1) },
  { id: 'u-5', email: 'laura.santos@empresa.com', name: 'Laura Santos', phone: '849-555-0105', cedula: '001-5678901-2', role: 'user', avatar_url: null, created_at: iso(-30), updated_at: iso(-30) },
];
const me = users.find((u) => u.role === role) ?? users[0];

const variables = [
  { id: 'v1', name: 'cliente_nombre', label: 'Nombre del cliente', type: 'text', required: true, options: null, description: 'Nombre completo o razón social', created_at: iso(-100), updated_at: iso(-100) },
  { id: 'v2', name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true, options: null, description: 'Inicio de vigencia', created_at: iso(-100), updated_at: iso(-100) },
  { id: 'v3', name: 'valor_contrato', label: 'Valor del contrato', type: 'number', required: true, options: null, description: 'Monto en RD$', created_at: iso(-100), updated_at: iso(-100) },
  { id: 'v4', name: 'modalidad_pago', label: 'Modalidad de pago', type: 'select', required: false, options: ['Mensual', 'Trimestral', 'Único pago'], description: '', created_at: iso(-90), updated_at: iso(-90) },
  { id: 'v5', name: 'objeto_contrato', label: 'Objeto del contrato', type: 'textarea', required: true, options: null, description: 'Descripción del servicio', created_at: iso(-90), updated_at: iso(-90) },
];

const templates = [
  { id: 't1', title: 'Contrato de Servicios Profesionales', description: 'Prestación de servicios de consultoría', category: 'servicios', status: 'active', variables: ['cliente_nombre', 'fecha_inicio', 'valor_contrato', 'objeto_contrato'], content: 'CONTRATO DE SERVICIOS\n\nEntre {{cliente_nombre}} y la institución, a partir del {{fecha_inicio}}, por un valor de RD$ {{valor_contrato}}.\n\nObjeto: {{objeto_contrato}}', created_by: 'u-admin', created_at: iso(-80), updated_at: iso(-10), user_profiles: { name: 'Ana Ureña' } },
  { id: 't2', title: 'Acuerdo de Confidencialidad', description: 'NDA estándar', category: 'legal', status: 'active', variables: ['cliente_nombre', 'fecha_inicio'], content: 'ACUERDO DE CONFIDENCIALIDAD entre {{cliente_nombre}}...', created_by: 'u-admin', created_at: iso(-70), updated_at: iso(-20), user_profiles: { name: 'Ana Ureña' } },
  { id: 't3', title: 'Arrendamiento de Local', description: 'Alquiler comercial', category: 'inmobiliario', status: 'inactive', variables: ['cliente_nombre', 'valor_contrato', 'modalidad_pago'], content: 'CONTRATO DE ARRENDAMIENTO...', created_by: 'u-sup', created_at: iso(-50), updated_at: iso(-40), user_profiles: { name: 'Carlos Méndez' } },
];

const mk = (id: string, title: string, client: string, approval: string, actual: string, status: string, value: number, start: number, end: number, extra: any = {}) => ({
  id, title, client_name: client, client_email: client.toLowerCase().replace(/[^a-z]/g, '') + '@correo.com', client_phone: '809-555-0000',
  approval_status: approval, actual_status: actual, status, contract_value: value, start_date: date(start), end_date: date(end),
  template_id: 't1', content: templates[0].content, generated_content: 'CONTRATO DE SERVICIOS\n\nEntre ' + client + ' y la institución...', variables_data: { cliente_nombre: client },
  current_version: 1, archived: false, archived_at: null, created_by: 'u-ges', created_at: iso(start - 5), updated_at: iso(-1), notes: null, rejection_reason: null,
  approved_by: null, approved_at: null, auto_renewal: false, parent_contract_id: null, renewal_type: 'original',
  contract_templates: { title: 'Contrato de Servicios Profesionales' }, user_profiles: { name: 'María Fernández', email: 'gestor@simaud.do' }, ...extra,
});

const contracts = [
  mk('c1', 'Consultoría TI 2026', 'Tecnologías del Caribe SRL', 'signed', 'active', 'active', 450000, -60, 300),
  mk('c2', 'Mantenimiento de Equipos', 'Servicios Técnicos Rivera', 'signed', 'expiring_soon', 'active', 125000, -340, 12),
  mk('c3', 'Auditoría Financiera Q4', 'Pérez & Asociados', 'pending_approval', 'draft', 'draft', 280000, 5, 120),
  mk('c4', 'Suministro de Material Gastable', 'Distribuidora Nacional', 'approved', 'active', 'active', 87500, -2, 360),
  mk('c5', 'Licencias de Software', 'Soft Solutions Dominicana', 'rejected', 'draft', 'draft', 960000, 10, 375, { rejection_reason: 'El monto excede el presupuesto aprobado. Ajustar a RD$ 800,000.' }),
  mk('c6', 'Servicio de Limpieza', 'Limpieza Total EIRL', 'draft', 'draft', 'draft', 54000, 15, 380),
  mk('c7', 'Seguridad Perimetral', 'Guardianes del Este', 'signed', 'expired', 'completed', 310000, -400, -20),
  mk('c8', 'Capacitación Docente', 'Instituto Formación Plus', 'cancelled', 'cancelled', 'cancelled', 150000, -30, 200, { rejection_reason: 'CANCELADO: Mutuo acuerdo' }),
];

const signatories = contracts.flatMap((c, i) => [
  { id: `s${i}a`, contract_id: c.id, name: c.client_name, email: 'usuario@simaud.do', phone: '', role: 'client', signing_order: 1, status: ['signed', 'approved'].includes(c.approval_status) || c.approval_status === 'signed' ? 'signed' : 'pending', signed_at: c.approval_status === 'signed' ? iso(-10) : null, signature_url: null, user_id: 'u-user', cedula: '031-4567890-1', created_at: c.created_at, contracts: c },
  { id: `s${i}b`, contract_id: c.id, name: 'Laura Santos', email: 'laura.santos@empresa.com', phone: '', role: 'witness', signing_order: 2, status: c.approval_status === 'signed' ? 'signed' : 'pending', signed_at: c.approval_status === 'signed' ? iso(-9) : null, signature_url: null, user_id: 'u-5', cedula: '', created_at: c.created_at, contracts: c },
]);

const approvals = contracts.filter((c) => c.approval_status === 'pending_approval').map((c, i) => ({
  id: `a${i}`, contract_id: c.id, version_number: 1, status: 'pending', requested_by: 'u-ges', requested_at: iso(-2), reviewed_by: null, reviewed_at: null, comments: null,
  contracts: { ...c, contract_templates: { title: 'Contrato de Servicios Profesionales' } }, user_profiles: { name: 'María Fernández', email: 'gestor@simaud.do' }, requester: { name: 'María Fernández', email: 'gestor@simaud.do' },
}));

const notifications = [
  { id: 'n1', user_id: me.id, type: 'contract_expiring', title: 'Contrato próximo a vencer', message: 'Mantenimiento de Equipos vence en 12 días', priority: 'high', read_at: null, created_at: iso(-0.1), data: { contract_id: 'c2' } },
  { id: 'n2', user_id: me.id, type: 'renewal_request', title: 'Nueva solicitud de renovación', message: 'José Rodríguez solicitó renovar Seguridad Perimetral', priority: 'medium', read_at: null, created_at: iso(-1), data: {} },
  { id: 'n3', user_id: me.id, type: 'approval_needed', title: 'Contrato pendiente de aprobación', message: 'Auditoría Financiera Q4 espera revisión', priority: 'medium', read_at: iso(-1), created_at: iso(-2), data: {} },
];

const renewals = [
  { id: 'r1', original_contract_id: 'c7', requested_by: 'u-user', status: 'pending', priority: 'urgent', proposed_start_date: date(1), proposed_end_date: date(366), proposed_value: 330000, proposed_changes: { notes: 'Ajuste por inflación' }, created_at: iso(-1), updated_at: iso(-1), contracts: contracts[6], original_contract: contracts[6], requester: { name: 'José Rodríguez Peña', email: 'usuario@simaud.do' } },
];

const tables: Record<string, any[]> = {
  user_profiles: users, contracts, contract_templates: templates, template_variables: variables, contract_signatories: signatories,
  contract_approvals: approvals, notifications, contract_renewals: renewals, contract_versions: [], contract_audit_logs: [], contract_cancellations: [],
};

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let single = false;
  let head = false;
  const result = () => {
    if (single) return { data: rows[0] ?? null, error: rows[0] ? null : { message: 'not found', code: 'PGRST116' } };
    return { data: head ? null : rows, error: null, count: rows.length };
  };
  const proxy: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
      if (prop === 'single' || prop === 'maybeSingle') return () => { single = true; return proxy; };
      if (prop === 'eq') return (col: string, val: any) => { rows = rows.filter((r) => r[col] === undefined || r[col] === val); return proxy; };
      if (prop === 'in') return (col: string, vals: any[]) => { rows = rows.filter((r) => r[col] === undefined || vals.includes(r[col])); return proxy; };
      if (prop === 'select') return (_s?: string, opts?: any) => { if (opts?.head) head = true; return proxy; };
      if (prop === 'insert' || prop === 'update' || prop === 'upsert' || prop === 'delete') return () => { rows = rows.slice(0, 1); return proxy; };
      return () => proxy;
    },
  });
  return proxy;
}

const authUser = role ? { id: me.id, email: me.email, email_confirmed_at: iso(-100), created_at: me.created_at, user_metadata: { name: me.name, role: me.role, phone: me.phone, cedula: me.cedula } } : null;
const session = authUser ? { user: authUser, access_token: 'mock-token' } : null;

const channel: any = { on: () => channel, subscribe: () => channel, unsubscribe: () => {} };

export const supabase: any = {
  from: query,
  rpc: async () => ({ data: null, error: null }),
  channel: () => channel,
  removeChannel: () => {},
  storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    getUser: async () => ({ data: { user: authUser }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: null, error: { message: 'Modo demo: usa ?mockRole=admin en la URL' } }),
    signUp: async () => ({ data: null, error: { message: 'Modo demo' } }),
    signOut: async () => { localStorage.removeItem('mock_role'); location.href = '/auth'; return { error: null }; },
    resend: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
    updateUser: async () => ({ data: {}, error: null }),
    admin: { updateUserById: async () => ({ error: null }) },
  },
};

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  created_at: string;
  updated_at: string;
}

// Fake edge-function responses (dashboard-stats, reports-*, renewal-manager…)
const statNums: Record<string, number> = new Proxy({}, { get: (_t, k: string) => (k.includes('rate') || k.includes('utilization') || k.includes('efficiency') ? 78.5 : k.includes('time') ? 2.4 : k.includes('value') ? 357125 : 12) });
const months = ['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'];
const chartRow = (name: string, i: number) => ({ month: name, name, title: name, label: name, status: name, role: name, category: name, count: 3 + ((i * 7) % 11), value: 120000 + i * 45000, total: 5 + i, usage_count: 2 + i, contracts: 3 + i, percentage: 10 + i * 8 });
const stats = { ...Object.fromEntries(['total_contracts','pending_approvals','pending_approval','new_contracts_month','total_value','new_users_month','approval_rate','total_variables','total_users','total_templates','template_utilization','new_templates_month','expiring_soon','expiring_contracts','expired_contracts','draft_contracts','contracts_this_week','contracts_generated','completed_contracts','avg_contract_value','avg_approval_time','active_templates','active_contracts','signed_contracts','expiring_soon_contracts','system_efficiency','average_contract_value'].map((k) => [k, statNums[k]])) };
const fakeStats = {
  stats, quick_stats: stats,
  charts: {
    contracts_by_month: Object.fromEntries(months.map((m, i) => [m, 2 + i])), value_trend: Object.fromEntries(months.map((m, i) => [m, 120000 + i * 40000])),
    status_distribution: { draft: 2, pending_approval: 1, approved: 1, signed: 3, rejected: 1 },
    role_distribution: { admin: 1, supervisor: 1, gestor: 1, user: 2 },
    template_usage: templates.map((t, i) => ({ ...chartRow(t.title, i), template_id: t.id })),
    variable_usage: variables.map((v, i) => chartRow(v.name, i)),
    template_categories: { servicios: 1, legal: 1, inmobiliario: 1 },
  },
  top_gestores: [{ user_id: 'u-ges', name: 'María Fernández', email: 'gestor@simaud.do', contracts: 14, total_value: 2400000, approval_rate: 92 }],
  recent_activity: contracts.slice(0, 5), recent_contracts: contracts.slice(0, 5), recent_templates: templates, pending_approvals_list: approvals,
  renewals, data: renewals, metrics: { total: 1, pending: 1, approved: 0, rejected: 0, urgent: 1 },
};
const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('/functions/v1/')) {
    return new Response(JSON.stringify({ success: true, ...fakeStats, data: fakeStats }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return realFetch(input, init);
};
