# T07 — Auditoría de seguridad y errores (SOLO LECTURA)

**Asignado a:** Codex (auditor) · **Revisa:** Claude, que repartirá las correcciones.
**No modifiques ningún archivo** salvo el informe `docs/tasks/T07-auditoria-seguridad.REPORT.md`. Otro agente está editando `api/src` en paralelo: si un archivo cambia mientras lo lees, vuelve a leerlo.
Lee `docs/HANDOFF.md`, `docs/PLAN.md` y `docs/CODE_STANDARDS.md` primero.

## Alcance
API completa (`api/src/**`, migraciones `api/drizzle/**`), capa de datos y auth del front (`src/lib/**`, `src/app/guards.tsx`),
despliegue (`deploy/**`, `api/Dockerfile`, `Dockerfile.web`, `docker-compose.prod.yml`).

## Qué buscar (verifica cada punto leyendo el código; no supongas)
1. **Autorización por endpoint**: haz una tabla endpoint → roles permitidos → comprobación real en el código. Busca IDOR (acceder a contratos, firmas, archivos, notificaciones, renovaciones o reportes ajenos cambiando un id), escalada de rol, supervisor aprobando su propio contrato, firmar fuera de turno, firmar dos veces, actuar sobre contratos en un estado no permitido.
2. **Autenticación y sesión**: JWT (algoritmo fijado, expiración, secreto), refresh rotado y detección de reuso, cookie (httpOnly, secure, sameSite, path), CSRF en refresh/logout, logout invalida, cambio de contraseña/rol invalida sesiones, enumeración de usuarios en login/registro/recuperación, tiempos constantes, tokens de email (un solo uso, caducidad, hash en BD), rate limits en login/registro/recuperar/reenviar.
3. **Entrada**: validación Zod en todos los cuerpos/query/params; SQL construido con `sql.raw` o concatenación; filtros/orden de reportes inyectables; límites de paginación; tamaño de cuerpos.
4. **Archivos**: subida de firmas/avatares (tipo real por magic bytes, tamaño, nombre, ruta → path traversal), descarga (permiso, `Content-Disposition`, `nosniff`), PDF generados.
5. **Fugas de datos**: respuestas que devuelven más de lo necesario (ya detectado: `GET /me/signatures` devuelve el contrato completo con `signedPdfPath`, `content`, `variablesData`), hashes/tokens en respuestas o logs, mensajes de error con trazas, SSE (ticket de un solo uso, aislamiento entre usuarios).
6. **Lógica de negocio**: máquina de estados (transiciones ilegales), carreras (doble aprobación/firma/renovación: `FOR UPDATE`, idempotencia), versión del documento ligada a la firma, jobs con advisory lock, renovación que activa al hijo y marca `renewed` al padre.
7. **Front**: tokens en memoria (no localStorage), XSS (`dangerouslySetInnerHTML`, enlaces `javascript:`), redirecciones abiertas (`from`, `?next`), guardas de ruta que dependen solo del cliente.
8. **Despliegue**: CORS, helmet/CSP, `TRUST_PROXY` y rate limit por IP real, secretos por defecto, usuario no root, puertos expuestos, backups.
9. **Errores funcionales** evidentes (bugs que rompen flujos) aunque no sean de seguridad.

Puedes ejecutar `npm run typecheck`, `npm audit` y leer tests. **No ejecutes la suite de tests** (la BD de pruebas la está usando otro agente).

## Informe
`docs/tasks/T07-auditoria-seguridad.REPORT.md`, en español:
- Tabla de autorización por endpoint.
- Hallazgos ordenados por severidad (Crítica, Alta, Media, Baja, Info), cada uno con: archivo:línea, descripción, escenario de explotación o fallo concreto, corrección propuesta, y si hace falta test nuevo.
- Lista de lo revisado sin hallazgos (para saber qué está cubierto).
- No incluyas valores de secretos.
