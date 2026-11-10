// mantener sincronizado con api/src/lib/validation/cedula-exceptions.ts
// Solo añadir documentos antiguos verificados con la JCE; nunca datos ficticios.
export const CEDULA_EXCEPTIONS: ReadonlySet<string> = new Set<string>();
