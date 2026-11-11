/**
 * Catalog variables used by the Dominican contract templates. People's name, cédula, email and phone
 * are NOT here: they come from the signer of each signature box ({party}_nombre…, T19).
 */
export interface VariableSeed {
  name: string;
  label: string;
  type: "text" | "date" | "number" | "select" | "textarea" | "money";
  required: boolean;
  description?: string;
  options?: string[];
}

const PAYMENT_OPTIONS = [
  "pago único al firmar",
  "pago único a la entrega",
  "mensualidades vencidas",
  "quincenas vencidas",
  "50 % de anticipo y 50 % a la entrega",
  "transferencia bancaria en una sola partida",
];

/** Address and nationality of a person who signs; their name, cédula and email come from the signer. */
function personVars(party: string, who: string): VariableSeed[] {
  return [
    {
      name: `${party}_domicilio`,
      label: `Domicilio de ${who}`,
      type: "text",
      required: true,
      description: "Calle, número, sector, municipio y provincia.",
    },
    {
      name: `${party}_nacionalidad`,
      label: `Nacionalidad de ${who}`,
      type: "text",
      required: true,
      description: "Por ejemplo: dominicana.",
    },
  ];
}

/** A company that signs through a representative (the signer of the box). */
function companyVars(prefix: string, party: string, who: string): VariableSeed[] {
  return [
    {
      name: `${prefix}_razon_social`,
      label: `Razón social de ${who}`,
      type: "text",
      required: true,
    },
    {
      name: `${prefix}_rnc`,
      label: `RNC de ${who}`,
      type: "text",
      required: true,
      description: "Registro Nacional de Contribuyentes (9 u 11 dígitos).",
    },
    {
      name: `${prefix}_domicilio`,
      label: `Domicilio social de ${who}`,
      type: "text",
      required: true,
    },
    {
      name: `${party}_cargo`,
      label: `Cargo del representante de ${who}`,
      type: "text",
      required: true,
      description: "Por ejemplo: Gerente General.",
    },
  ];
}

export const VARIABLES: VariableSeed[] = [
  // Filled by the wizard from the contract itself.
  { name: "fecha_inicio", label: "Fecha de inicio", type: "date", required: true },
  { name: "fecha_fin", label: "Fecha de fin", type: "date", required: true },
  { name: "valor_contrato", label: "Valor del contrato", type: "money", required: true },
  { name: "duracion_meses", label: "Duración en meses", type: "number", required: true },
  {
    name: "ciudad_firma",
    label: "Ciudad de firma",
    type: "text",
    required: true,
    description: "Por ejemplo: Santo Domingo, D. N.",
  },
  {
    name: "forma_pago",
    label: "Forma de pago",
    type: "select",
    required: true,
    options: PAYMENT_OPTIONS,
  },

  // People.
  ...personVars("prestador", "el prestador del servicio"),
  ...personVars("cliente", "el cliente"),
  ...personVars("trabajador", "el trabajador"),
  ...personVars("arrendador", "el arrendador"),
  ...personVars("arrendatario", "el arrendatario"),
  ...personVars("fiador", "el fiador solidario"),
  ...personVars("vendedor", "el vendedor"),
  ...personVars("comprador", "el comprador"),
  ...personVars("prestamista", "el prestamista"),
  ...personVars("prestatario", "el prestatario"),
  ...personVars("reveladora", "la parte reveladora"),
  ...personVars("receptora", "la parte receptora"),

  // Companies represented by a signer.
  ...companyVars("empresa", "empleador", "el empleador"),
  ...companyVars("proveedor_empresa", "proveedor", "el proveedor"),
  ...companyVars("institucion", "representante", "la institución"),

  // Services.
  {
    name: "descripcion_servicios",
    label: "Descripción de los servicios",
    type: "textarea",
    required: true,
  },
  {
    name: "entregables",
    label: "Entregables",
    type: "textarea",
    required: false,
    description: "Informes, productos o resultados esperados.",
  },

  // Employment.
  { name: "puesto_trabajo", label: "Puesto de trabajo", type: "text", required: true },
  { name: "funciones_puesto", label: "Funciones del puesto", type: "textarea", required: true },
  { name: "salario_mensual", label: "Salario mensual", type: "money", required: true },
  {
    name: "horario_trabajo",
    label: "Horario de trabajo",
    type: "text",
    required: true,
    description: "Por ejemplo: lunes a viernes de 8:00 a. m. a 5:00 p. m.",
  },
  { name: "lugar_trabajo", label: "Lugar de trabajo", type: "text", required: true },
  {
    name: "causa_temporal",
    label: "Causa del contrato por tiempo determinado",
    type: "textarea",
    required: true,
    description: "Obra o servicio concreto que justifica la duración limitada.",
  },

  // Leases.
  { name: "inmueble_direccion", label: "Dirección del inmueble", type: "text", required: true },
  {
    name: "inmueble_descripcion",
    label: "Descripción del inmueble",
    type: "textarea",
    required: true,
    description: "Habitaciones, baños, parqueos, áreas y estado.",
  },
  { name: "renta_mensual", label: "Renta mensual", type: "money", required: true },
  { name: "deposito_meses", label: "Meses de depósito", type: "number", required: true },
  { name: "dia_pago", label: "Día de pago de cada mes", type: "number", required: true },
  {
    name: "actividad_comercial",
    label: "Actividad comercial del local",
    type: "text",
    required: true,
  },
  {
    name: "incremento_anual",
    label: "Incremento anual de la renta (%)",
    type: "number",
    required: true,
  },

  // Vehicle sale.
  { name: "vehiculo_marca", label: "Marca del vehículo", type: "text", required: true },
  { name: "vehiculo_modelo", label: "Modelo del vehículo", type: "text", required: true },
  { name: "vehiculo_anio", label: "Año del vehículo", type: "number", required: true },
  { name: "vehiculo_color", label: "Color del vehículo", type: "text", required: true },
  { name: "vehiculo_placa", label: "Placa", type: "text", required: true },
  { name: "vehiculo_chasis", label: "Número de chasis", type: "text", required: true },
  { name: "vehiculo_matricula", label: "Número de matrícula", type: "text", required: true },

  // Real estate promise.
  {
    name: "inmueble_titulo",
    label: "Certificado de título / matrícula",
    type: "text",
    required: true,
    description: "Número de matrícula del Registro de Títulos.",
  },
  { name: "inmueble_designacion", label: "Designación catastral", type: "text", required: true },
  { name: "monto_inicial", label: "Monto inicial (arras)", type: "money", required: true },

  // Loan.
  { name: "monto_prestamo", label: "Monto del préstamo", type: "money", required: true },
  {
    name: "tasa_interes_mensual",
    label: "Tasa de interés mensual (%)",
    type: "number",
    required: true,
  },
  { name: "numero_cuotas", label: "Número de cuotas", type: "number", required: true },
  { name: "monto_cuota", label: "Monto de cada cuota", type: "money", required: true },

  // Confidentiality.
  {
    name: "proposito_confidencialidad",
    label: "Propósito para el que se comparte la información",
    type: "textarea",
    required: true,
  },
  {
    name: "anios_confidencialidad",
    label: "Años de confidencialidad",
    type: "number",
    required: true,
  },
  {
    name: "penalidad_incumplimiento",
    label: "Penalidad por incumplimiento",
    type: "money",
    required: true,
  },

  // Supply.
  {
    name: "bienes_descripcion",
    label: "Bienes a suministrar",
    type: "textarea",
    required: true,
    description: "Cantidad, especificaciones y precio unitario.",
  },
  { name: "lugar_entrega", label: "Lugar de entrega", type: "text", required: true },
  { name: "plazo_entrega_dias", label: "Plazo de entrega (días)", type: "number", required: true },
  { name: "garantia_meses", label: "Garantía (meses)", type: "number", required: true },
];
