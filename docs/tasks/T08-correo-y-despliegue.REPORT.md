# T08 — Correo y preparación del despliegue

Fecha: 2026-11-09. Implementación sin dependencias nuevas y sin git commit.

## Resultado y migración

- Drivers configurables Resend (fetch HTTP), SMTP (Nodemailer) y log. Interfaz MailTransport y errores MailDeliveryError temporales/permanentes. log registra únicamente destinatario, asunto y tipo.
- Migración Drizzle `0006_t08_mail_outbox.sql`, snapshot y journal generados: tabla email_outbox con índice por status/next_attempt_at, checks de estado/intentos, y users.must_change_password con valor inicial false. Aplicada y comprobada en simaud_test2; no se aplicó a desarrollo ni producción.
- Correo encolado en la misma transacción que registro, tokens de confirmación/recuperación, cambio de email e invitaciones administrativas. Las notificaciones encolan firma requerida, aprobación/devolución (incluido comentario), activación, vencimientos y renovación solicitada/resuelta. También reciben aviso los firmantes sin usuario vinculado.
- Plantillas HTML con tablas, ancho 600 px, estilos en línea, color #8B2029, fuente del sistema y versión texto. Datos escapados; enlaces basados en APP_URL a /auth/confirmar, /auth/restablecer, /app/contratos/:id y /app/firmas. Se omite el logo opcional para no depender de un recurso inexistente.
- Preferencias: firma → emailOnSignatureRequired; vencimiento → emailOnExpiry; aprobación, activación, renovación y otros avisos → emailOnApprovalResult. Los correos de seguridad e invitación siempre se encolan.

## Despacho y administración

email-dispatch corre cada minuto con el advisory lock existente; FOR UPDATE SKIP LOCKED protege también invocaciones directas simultáneas. Procesa hasta 100 filas por ejecución. Reintenta tras 1/2/4/8/16 minutos y marca failed al sexto fallo temporal, o al primer fallo permanente. HTTP 429/5xx/408 y errores de red/timeouts son temporales; otros 4xx son permanentes. SMTP 4xx es temporal y 5xx permanente. last_error guarda un código saneado, recortado a 250 caracteres; nunca el cuerpo ni el mensaje arbitrario del proveedor.

Se guarda provider_id y se vacía payload al entregar. cleanup elimina enviados de más de 30 días y conserva pendientes/fallidos. Estos últimos pueden contener tokens y requieren acceso restringido a BD/backups.

POST /api/v1/system/mail/test {to}, solo admin, devuelve 202 con el id encolado. GET /api/v1/system/jobs conserva el array de jobs y añade email-dispatch con outbox: {pending,failed}. El envío manual usa POST /api/v1/system/jobs/email-dispatch/run.

Resend usa el UUID de la outbox como clave de idempotencia (ventana del proveedor: 24 h). SMTP conserva Message-ID, pero no puede garantizar exactamente una entrega ante una caída después de aceptar el mensaje y antes del commit. Esa limitación queda documentada; no hay reenvío automático de failed.

## Variables y despliegue

| Variable                                | Regla                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| MAIL_DRIVER                             | log por defecto; producción exige resend o smtp                                       |
| RESEND_API_KEY                          | Requerida con resend                                                                  |
| SMTP_URL                                | Requerida con smtp; admite smtp:// o smtps://; credenciales codificadas como URL      |
| MAIL_FROM                               | Obligatoria fuera de log; se valida la dirección, con nombre visible opcional         |
| MAIL_REPLY_TO                           | Dirección opcional                                                                    |
| HOST                                    | IP o localhost; valor local 127.0.0.1; Compose fija 0.0.0.0                           |
| DATABASE_URL_TEST                       | Solo obligatoria con NODE_ENV=test; omitir en producción                              |
| ADMIN_NAME / ADMIN_EMAIL / ADMIN_CEDULA | Alternativas a los argumentos del comando inicial                                     |
| ADMIN_PASSWORD                          | Opcional; mínimo 12 caracteres con mayúsculas, minúsculas y números; nunca se imprime |

Se actualizaron api/.env.example, deploy/.env.prod.example, api/README.md y docs/DEPLOY.md. En docker-compose.prod.yml el único cambio es HOST en el entorno de API. La guía explica dominio verificado y DNS SPF/DKIM en Resend, salida HTTPS necesaria y cambio a SMTP institucional mediante variables.

### Probar envío real

1. Configurar MAIL_DRIVER=resend, RESEND_API_KEY y MAIL_FROM de un dominio verificado en Resend (registros DNS exactos de su panel), o MAIL_DRIVER=smtp, SMTP_URL y remitente autorizado por TI. MAIL_REPLY_TO es opcional.
2. Aplicar migraciones y recrear API con JOBS_ENABLED=true.
3. Con un admin que ya cambió su contraseña temporal, llamar POST /api/v1/system/mail/test con un buzón controlado y Bearer. No registrar JWT ni credenciales.
4. Esperar el siguiente minuto o ejecutar manualmente email-dispatch. Consultar pendientes/fallidos y lastRun, y confirmar recepción de HTML y texto en el buzón.

No se realizó envío real ni despliegue: los transportes de las pruebas están simulados.

## Primer administrador

Comando fuente: npx tsx src/db/create-admin.ts --name "Administración" --email admin@universidad.example --cedula 001-1234567-8. En la imagen compilada: node dist/db/create-admin.js con los mismos argumentos, por ejemplo mediante dc exec api. No usa seed de demostración.

Si se omite ADMIN_PASSWORD, genera una contraseña de 192 bits aleatorios más un prefijo que asegura complejidad y la imprime una sola vez después del commit. Si el correo ya existe, no modifica rol, contraseña ni otros datos y lo comunica; las altas concurrentes se serializan con el lock de administración existente.

El usuario nace admin, confirmado y con must_change_password=true. Login expone user.mustChangePassword. Las rutas protegidas y refresh devuelven PASSWORD_CHANGE_REQUIRED hasta usar PATCH /me/password; logout sigue disponible. Se revalida también al consumir un ticket SSE. Cambiar o restablecer contraseña elimina el indicador y se impide reutilizar la misma contraseña temporal. No se modificó el frontend: el cliente debe atender el indicador y enviar currentPassword/newPassword con Bearer.

## Aislamiento de pruebas y convivencia con T06

api/test/database.ts admite nombres cuyo prefijo sea simaud_test, incluidos simaud_test y simaud_test2, y rechaza un nombre igual al de desarrollo incluso con otro host/usuario. Exige NODE_ENV=test y una URL de pruebas explícita. Se documentó que dotenv conserva variables exportadas. db:reset conserva su lista restrictiva de nombres; solo se añadió la aserción de tipo necesaria por la nueva opcionalidad de DATABASE_URL_TEST.

La terminal habitual falló antes de poder ejecutar comandos. El ejecutor alternativo no heredó la variable de pruebas indicada y una primera corrida utilizó simaud_test; se detectó y comunicó. Esa corrida terminó y sus resultados no se consideraron validación por la posible interferencia con T06. Las corridas posteriores fijaron simaud_test2 únicamente en el entorno del proceso, sin modificar .env ni imprimir su contenido o la URL. La pasada completa intermedia se ejecutó mientras aún se editaban archivos y detectó expectativas/código anteriores; se repitió la verificación con archivos estables.

No se introdujeron cambios de T08 en los schemas.ts de módulos, src/lib/validation, api/src/lib/validation ni src/lib/format.ts. El working tree contiene cambios concurrentes de T06 que se conservaron. Los cambios necesarios fuera del listado principal de T08 son app.ts (inyección de transporte sin tragarse fallos), plugins/auth.ts y notifications/events.ts (bloqueo de contraseña), errors.ts (nuevo código) y db/reset.ts (tipado de variable opcional).

## Verificación

| Comprobación                        | Resultado                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API: npm run format                 | Correcto; después se aplicó Prettier a los archivos concretos de T08                                                                                                                       |
| API: npm run format:check           | Correcto                                                                                                                                                                                   |
| API: npm run typecheck              | Correcto                                                                                                                                                                                   |
| API: npm run build                  | Correcto; incluye dist/db/create-admin.js                                                                                                                                                  |
| API: npm test -- --reporter=verbose | **369/369 tests correctos, 12 archivos**, pasada final completa en simaud_test2, código 0                                                                                                  |
| Web: npm run format:check           | Correcto                                                                                                                                                                                   |
| Web: npm test                       | **94/94 tests correctos, 9 archivos**                                                                                                                                                      |
| Web: npm run build                  | Correcto; aviso existente de Vite sobre __dirname en la configuración                                                                                                                      |
| Web: npm run typecheck              | Falla en componentes heredados fuera del alcance: variables no usadas, tipos Contract/ContractSignatory, auto_renewal y manejo de unknown, entre otros; no se modificaron esos componentes |
| API y web: npm audit                | No verificable: falló la conexión al endpoint de auditoría de registry.npmjs.org. El reintento de API con caché local también falló. No se afirma ausencia de vulnerabilidades             |
| git diff --check                    | Correcto                                                                                                                                                                                   |

Las pruebas nuevas cubren Resend/SMTP simulados (éxito, errores permanentes, temporales y timeout), log sin tokens, escape de todas las plantillas, rollback de outbox, backoff y máximo seis intentos, dos instancias sin doble envío, limpieza, preferencias y correos de seguridad, permisos/diagnóstico de correo, creación idempotente/concurrente del administrador, contraseña generada fuerte, cambio obligatorio y recuperación sin reutilizar la contraseña temporal. Las regresiones existentes de registro, firmas, contratos, renovaciones y SSE también pasan.

Las ejecuciones finales no necesitaron modificar ni mostrar api/.env ni el valor de DATABASE_URL_TEST. Los scripts temporales del ejecutor alternativo se retiraron al terminar.

## Decisiones y pendientes

- Sin SDK de Resend, dependencias adicionales, commits ni cambios de configuración secreta.
- SMTP usa exclusivamente SMTP_URL. Se mantuvo el contrato de array de /system/jobs.
- Se reutiliza emailOnApprovalResult para activaciones/renovaciones porque no hay una preferencia específica para ellas.
- No existe pantalla nueva de primer cambio de contraseña: el alcance implementado es el bloqueo y contrato de API, documentado para el cliente.
- Quedan por validar con TI las credenciales y entrega real del proveedor, DNS y ejecución Docker en el host de destino. Las otras condiciones previas de frontend/CSP de T05 siguen descritas en docs/DEPLOY.md.
