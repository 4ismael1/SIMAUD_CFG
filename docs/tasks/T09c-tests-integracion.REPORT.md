# T09c — Integración de las pruebas tras T09a/T09b

Fecha: 9 de noviembre de 2026, America/New_York.

## Alcance y decisiones

Se leyeron `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`, la tarea T09c y los informes T09a/T09b antes de editar. Los cambios se limitan a `api/test` y este informe; no se editaron `api/src` ni archivos `t11-*`. Se utilizó la variable de entorno `DATABASE_URL_TEST` destinada a `simaud_test2`, sin imprimirla ni leer/imprimir `api/.env`. No se hizo git commit.

Se reutiliza `signIn` de `test/helpers.ts` como mecanismo común de autenticación: llama a login por HTTP, crea la familia persistida y obtiene el bearer y la cookie reales. No se introdujeron excepciones a `authenticate`. Los JWT construidos directamente que permanecen en la suite corresponden a pruebas unitarias de JWT o a pruebas explícitas de rechazo/validación de sesiones de T09a.

## Cambios por archivo

| Archivo en `api/test`    | Cambio                                                                                                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.ts`             | Documenta el login real compartido y retira un import de tipo sin uso.                                                                                                                                                                                                                          |
| `contracts.test.ts`      | Sustituye los JWT sin sesión por `signIn`, usa PNG válido y adapta la bandeja a `{ data, meta }`. El fixture de vinculación inmediata aporta correo y cédula coincidentes. Comprueba el vínculo de identidad en BD y la ausencia de `userId` en el DTO público.                                 |
| `lifecycle.test.ts`      | Usa sesiones reales y PNG válido. Los contratos sintéticos incluyen su versión con snapshot de definiciones vacío, coherente con su contenido sin variables. La limpieza conserva cinco sesiones con caducidad posterior a la fecha inyectada y elimina únicamente el refresh vencido del caso. |
| `core.test.ts`           | Exige registro opaco 202, comprueba el rol en BD, rechaza disponibilidad pública con 404 y espera revocación de todas las familias tras reuso. Usa un PNG válido para cargar, servir y borrar el avatar.                                                                                        |
| `admin.test.ts`          | Verifica el rechazo del bearer anterior tras cambiar contraseña y usa el bearer nuevo. Obtiene el enlace de recuperación descifrando la outbox con el módulo autorizado y su contexto autenticado; exige payload JSON vacío. Añade clave sintética de correo al fixture de configuración.       |
| `contracts-unit.test.ts` | Añade `MAIL_PAYLOAD_KEY` sintética a la configuración aislada que comprueba `TRUST_PROXY`.                                                                                                                                                                                                      |
| `database.test.ts`       | Incluye `contract_signatory_binding_review` y `storage_migration_objects` (T11) en la lista exacta de 20 tablas.                                                                                                                                                                                |
| `mail-outbox.test.ts`    | Entrega el reset con una fecha inyectada posterior al intento programado y anterior a su caducidad; compensa la diferencia de precisión entre PostgreSQL y Date sin esperas y exige un intento real.                                                                                            |
| `mail.test.ts`           | Añade la clave sintética requerida y admite el enlace `/auth/recuperar` de la plantilla `account_exists`.                                                                                                                                                                                       |
| `image-fixtures.ts`      | Centraliza la creación de un PNG RGBA válido y determinista con transparencia.                                                                                                                                                                                                                  |
| `t09b-helpers.ts`        | Reexporta el fixture PNG común para evitar duplicación.                                                                                                                                                                                                                                         |

Los fixtures aislados de administración, contratos y correo incluyen también `SETTINGS_ENCRYPTION_KEY`, requerida por T11 durante esta integración. `t09a-mail-security.test.ts` incorpora esa clave sintética en su fixture de desarrollo y conserva todas las comprobaciones de obligatoriedad, formato y confidencialidad de `MAIL_PAYLOAD_KEY`. No se modificaron las variables privadas del entorno.

`t09b-storage-migration.test.ts` conserva el rechazo de traversal y comprueba el error estructurado de T11 (`reason: invalid`, HTTP 400 y `VALIDATION_ERROR`) en vez de depender de un fragmento del mensaje antiguo.

Prettier se ejecutó exclusivamente con listas explícitas de los archivos modificados. No se utilizó `npm run format`.

## Verificación

Primera suite completa: **421 aprobadas y 3 fallidas, 424 casos en 22 archivos**, 835,98 s. Los tres fallos correspondían a los últimos ajustes de fixtures: vinculación inmediata sin cédula, sesiones actuales que también vencían antes de la fecha de cleanup, y pérdida de microsegundos al calcular el momento de entrega. Se corrigieron conservando las aserciones de seguridad.

Durante la repetición, T11 amplió `/system/jobs` con `storage-migrate`. `lifecycle.test.ts` exige ahora los cinco nombres exactos y mantiene el rechazo de acceso del gestor; ya no cuenta únicamente cuatro elementos.

Segunda suite completa: **435 aprobadas, 3 fallidas y 1 omitida, 439 casos en 24 archivos**, 950,08 s. Los fallos eran el conteo antiguo de jobs, el texto antiguo del rechazo de traversal y el caso nuevo T11 de un PUT aceptado cuya respuesta se pierde. Tras adaptar los dos tests permitidos y los cambios concurrentes de T11, la repetición aislada de los tres casos pasó: **3/3**, 23,31 s. No se modificó `t11-storage.test.ts` ni su implementación.

Resultado final de `npm test`: **438 aprobadas, 0 fallidas y 1 omitida; 439 casos en 24 archivos aprobados**, 1061,25 s. La única omitida es la comprobación de permisos Unix 0700/0600 de `t11-disk.test.ts`, excluida expresamente en Windows. T09c no añadió omisiones ni `it.fails`.

| Comprobación desde `api/`                      | Resultado final                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run format:check`                         | Aprobado globalmente; Prettier solo escribió los archivos propios enumerados. |
| `npm run typecheck`                            | Aprobado.                                                                     |
| `npm test`                                     | 438 aprobadas, 1 omitida por plataforma, 0 fallidas.                          |
| `npm audit`                                    | Aprobado: 0 vulnerabilidades.                                                 |
| `npm run build`                                | Aprobado.                                                                     |
| `git diff --check` de los archivos modificados | Aprobado.                                                                     |

Se utilizó `npm.cmd` por la política de ejecución de PowerShell. Se retiraron los logs temporales de estas ejecuciones después de registrar sus resultados.

## Bugs y trabajo concurrente

Una ejecución intermedia de `typecheck` detectó que `src/lib/storage/config.ts` usaba `SETTINGS_ENCRYPTION_KEY` antes de que existiera en el tipo de configuración. Una ejecución posterior ya pasó sin cambios propios en `api/src`. El chequeo global de formato también señaló temporalmente archivos de T11 (`src/config/env.ts`, `src/lib/storage.ts`, `src/modules/system/settings.ts`); no se reformatearon desde T09c.

El fallo intermedio del PUT S3 perdido aparecía en `responseError`/`S3Storage.put` con un conflicto 412 (`El archivo ya existe.`). La implementación concurrente de T11 incorporó la comprobación del identificador de escritura y los bytes almacenados; tanto su reproducción aislada como la suite final pasaron. No quedan bugs reproducidos de `api/src` pendientes en esta entrega. No se modificó código de producción para hacer pasar pruebas ni se relajaron las reglas de autenticación, identidad, inmutabilidad o caducidad.
