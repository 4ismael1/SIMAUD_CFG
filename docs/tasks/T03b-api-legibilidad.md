# T03b — API: cerrar T03 (legibilidad del código + informe)

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T03 (ya implementado, sin informe).
Alcance: solo `api/src/**`, `api/test/**` y `docs/tasks/T03*`. **No toques** `api/Dockerfile`, `deploy/`, `docker-compose*`, ni nada fuera de `api/` (otra tarea trabaja ahí en paralelo).

## Contexto
T03 (renovaciones, notificaciones/SSE, jobs, dashboard, reportes, PDF) quedó implementado y pasa
`typecheck`, `format:check`, `npm audit` y los tests, pero la sesión se cortó antes de escribir el informe
y el código sigue **compactado**: SQL de cientos de caracteres en una sola línea, sin líneas en blanco
entre imports/funciones, varias ideas por expresión. El dueño exige código mantenible (ver `docs/CODE_STANDARDS.md`).

## 1. Refactor de legibilidad SIN cambiar comportamiento
Archivos prioritarios (líneas > 140 columnas): `src/modules/dashboard/routes.ts` (29), `src/modules/reports/routes.ts`,
`src/modules/renewals/routes.ts`, `src/jobs/index.ts`, `src/modules/system/routes.ts`. Revisa también el resto de módulos de T03.

- SQL multilínea con indentación: una cláusula por línea (`select`, `from`, `join`, `where`, `group by`…), una columna por línea cuando son más de 3.
- Las consultas grandes del dashboard: sepáralas en funciones con nombre (`getAdminAttention`, `getAdminKpis`, `getMonthlySeries`…) en un `service.ts`/`queries.ts` del módulo; `routes.ts` solo valida, llama y responde.
- Expresiones repetidas (p. ej. `(now() at time zone 'America/Santo_Domingo')::date`) → fragmento `sql` reutilizable con nombre.
- Línea en blanco entre imports y código y entre funciones. Nombres descriptivos (nada de `c`, `p`, `s` fuera de alias SQL cortos y obvios).
- Ninguna línea > 120 columnas salvo URLs/strings irrompibles.
- Prohibido cambiar contratos de respuesta, permisos o SQL semántico. Si encuentras un bug real, corrígelo con un test que lo demuestre y anótalo en el informe.

## 2. Verificación (todo debe pasar al final)
Desde `api/`: `npm run format && npm run format:check && npm run typecheck && npm test && npm audit`.
La BD de pruebas está accesible (túnel en `localhost:55432`, `DATABASE_URL_TEST` en `api/.env` — no imprimas el `.env`).

## 3. Informe
Escribe `docs/tasks/T03-api-ciclo-vida.REPORT.md` cubriendo T03 completo (qué endpoints/jobs/migraciones existen,
decisiones, desviaciones de la tarea T03, número de tests) y una sección «T03b refactor» con lo cambiado y cualquier bug encontrado.
No hagas git commit.
