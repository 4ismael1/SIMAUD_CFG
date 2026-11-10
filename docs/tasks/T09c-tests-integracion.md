# T09c — Adaptar los tests antiguos a T09a/T09b y dejar la suite en verde

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md` y los informes `T09a-seguridad-sesiones.REPORT.md` y `T09b-seguridad-contratos.REPORT.md` (sección de fallos de la suite).
Alcance: **solo `api/test/**`** y `docs/tasks/T09c*`. Si para que un test pase hace falta tocar `api/src`, **no lo hagas**: descríbelo en el informe (puede ser un bug real). Otra tarea (T11) trabaja en paralelo en `api/src/lib/storage*` y `system`.
Base de pruebas: la variable `DATABASE_URL_TEST` de tu entorno (apunta a `simaud_test2`).

## Qué hacer
- Los ~35–37 fallos vienen de que los fixtures firman JWT sin crear sesión (ahora 401), de expectativas antiguas (registro 201/409, `/auth/availability`, refresh que conserva otras familias, `payload.token` en claro en la outbox, conteo de tablas, fixtures de configuración sin `MAIL_PAYLOAD_KEY`, fechas de caducidad incoherentes, avatar no PNG).
- Crea en `test/helpers.ts` (o el helper existente) una forma única de autenticar en tests que use una **sesión real** (login o familia persistida con `familyId`), y migra todos los tests a ella. Nada de saltarse la autenticación.
- Actualiza expectativas para reflejar el comportamiento **nuevo y correcto** (no relajes aserciones de seguridad para que pasen). Si un test antiguo revela un fallo real del código nuevo, déjalo fallando con `it.fails`/nota y repórtalo.
- La entrega del enlace de recuperación en tests debe obtenerse por el mecanismo autorizado (descifrado de la outbox con la clave de test), no leyendo texto claro.

## Verificación
Desde `api/`: `npm run format:check && npm run typecheck && npm test && npm audit` → **todo en verde** (o con los fallos reales documentados). Indica el total de tests.

## Informe
`docs/tasks/T09c-tests-integracion.REPORT.md`: qué se cambió por archivo, total de tests, y cualquier bug real encontrado en `api/src`. No hagas git commit. No imprimas `api/.env`.
