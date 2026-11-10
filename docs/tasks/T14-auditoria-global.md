# T14 — Segunda auditoría global de la API (solo lectura)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`, `docs/HANDOFF.md`
y los informes T07, T09a, T09b, T10, T11 y T12a.

**No modifiques ningún archivo** salvo el informe final. No ejecutes la suite de tests ni toques bases de datos
(otros dos Codex están trabajando en paralelo en `api/` con T13 y T12b: ignora sus cambios sin commitear, audita
`git show HEAD` / el árbol commiteado). No imprimas secretos ni leas `api/.env`.

## Qué revisar (API completa, `api/src/**`)
1. **Permisos por endpoint**: tabla de todas las rutas con rol requerido y comprobación de alcance real (gestor solo lo
   suyo, supervisor no aprueba lo propio, firmante solo su turno, admin todo). Busca IDOR, rutas sin `preHandler`,
   respuestas que revelan existencia (403 vs 404), campos sensibles en respuestas (cédula, IP, hashes de sesión).
2. **Entradas**: Zod estricto en todo body/query/params, límites de tamaño, multipart (tipos, partes, tamaños),
   paginación acotada, `ilike` con comodines escapados, SQL crudo con parámetros.
3. **Auth y sesiones**: rotación de refresh, revocación, rate limits (login, registro, recuperar, verificar, correo),
   enumeración de usuarios, cookies (`httpOnly`, `secure`, `sameSite`), CORS, `TRUST_PROXY`.
4. **Firma y evidencia (T10)**: carreras en la última firma, idempotencia del PDF final, verificación pública sin datos
   personales, revocación, borrado.
5. **Almacenamiento (T11)**: rutas de archivo (path traversal), cifrado, S3/SSRF, migración interrumpida.
6. **Reportes y paneles (T12a)**: fugas entre roles en filtros/exportaciones, coste de consultas (índices que falten,
   consultas N+1), exportaciones grandes.
7. **Jobs, SSE, correo**: advisory locks, tickets SSE, plantillas de correo con datos sin escapar.
8. **Calidad**: código compactado o ilegible (CODE_STANDARDS), duplicación, funciones demasiado largas, tests que
   faltan para reglas de negocio.

## Entrega
`docs/tasks/T14-auditoria-global.REPORT.md`: hallazgos ordenados por gravedad (crítico/alto/medio/bajo/mejora), cada uno
con archivo:línea, escenario concreto de fallo y corrección propuesta (sin aplicarla). Al final, lista de tareas
propuestas agrupadas para que Claude las asigne. No hagas git commit.
