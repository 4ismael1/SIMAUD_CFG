# T07 — Auditoría de seguridad y errores

Fecha: 9 de noviembre de 2026. Revisión estática, solo lectura.

## Resultado

**13 hallazgos vigentes: 2 Alta, 9 Media, 1 Baja y 1 Info.** No se confirmó severidad Crítica. Las prioridades son el vínculo de firmantes mediante una cédula sin titularidad verificada y la revocación incompleta del acceso JWT. Se distinguen vulnerabilidades, fallos funcionales e integración pendiente.

Único archivo escrito por esta auditoría: docs/tasks/T07-auditoria-seguridad.REPORT.md. No se ejecutaron la suite de tests, aplicaciones, peticiones de explotación, jobs, migraciones ni seeds. No se leyeron .env, credenciales, claves privadas, logs o datos de storage; no se incluyen valores de secretos. No se importaron módulos de aplicación, evitando dotenv y efectos de inicialización.

## Alcance y límites

- Se leyeron primero docs/HANDOFF.md, docs/PLAN.md y docs/CODE_STANDARDS.md; se releyó HANDOFF tras su cambio. Se revisaron rutas, servicios, configuración, auth, esquema, cliente de BD, librerías y jobs de api/src; siete migraciones SQL 0000–0006; capa nueva src/lib, validadores y src/app/guards.tsx; Dockerfiles, Compose y deploy. Se consultaron router, navegación, pantalla de firma y DocumentView para comprobar los flujos dependientes.
- Durante el cierre aparecieron cambios concurrentes de validación y correo. Se releyeron los archivos cambiados y los nuevos módulos; el informe corresponde al contenido actualizado. La matriz incluye el endpoint nuevo POST /system/mail/test y el job email-dispatch. Una tarea anunciada en documentación no se dio por implementada sin leer su código.
- Se excluyeron los cuatro scripts de seed/mantenimiento de contraseñas api/src/db/{seed.ts,seed-data.ts,seed-contracts.ts,dev-reset-seed-passwords.ts}, para no acceder a posibles credenciales locales incrustadas. No se certifican esos scripts. Sí se revisó el código del nuevo create-admin.ts sin ejecutarlo. Los snapshots JSON generados por Drizzle no se contrastaron exhaustivamente: se contrastaron schema.ts y SQL ejecutable.
- Se identificaron Supabase/mock como legado: src/main.tsx carga src/app/App.tsx y el router nuevo usa features/lib/auth. Su persistencia antigua no se presenta como vulnerabilidad del flujo nuevo. No se auditó el backend Supabase histórico.
- No se ejecutaron typecheck, build, format, npm audit ni tests. La terminal falló al crear el proceso y se continuó mediante lectura directa. Los tests existentes se leyeron como código; no se atribuyen resultados de ejecución. No se certifican ausencia de CVE, tipos correctos ni configuración efectiva de un servidor.
- La revisión usa la habilidad security-best-practices para TypeScript/React, con comprobaciones propias de Fastify/PostgreSQL. Las conclusiones provienen del código local; no se sustituyó verificación de una ruta por una recomendación genérica.

## Matriz de autorización por endpoint

Todas las rutas siguientes llevan el prefijo **/api/v1** (api/src/app.ts). Las rutas GET también tienen el HEAD implícito de Fastify. Se indican permisos reales del servidor, no visibilidad de botones.

Convenciones: A=admin, S=supervisor, G=gestor, U=user. «Autenticado» exige JWT válido, usuario activo, no eliminado, email confirmado y rol igual al JWT (api/src/plugins/auth.ts); tiene la limitación de revocación H02. Si mustChangePassword está activo, authenticate solo admite PATCH /me/password (plugins/auth.ts); el flujo web asociado se analiza en H10. «Lectura C» significa A/S sobre cualquiera, G sobre creados por él, o cualquier rol vinculado como firmante mediante userId (contracts/service.ts). «Gestión C» significa A/S o G creador (service.ts). H01 afecta la confiabilidad del vínculo como firmante. Las referencias abreviadas de esta matriz nombran el archivo dentro del módulo indicado; los hallazgos incluyen archivo y línea exactos.

### Auth, perfil y usuarios

| Endpoint | Roles / identidad permitidos | Comprobación real y evidencia |
|---|---|---|
| GET /health | Público | Consulta select 1, sin datos de BD; app.ts. |
| POST /auth/register | Público; crea U | auth/routes.ts; service.ts fija role=user. |
| GET /auth/availability | Público | auth/routes.ts consulta email/cédula sin auth; H05. |
| POST /auth/login | Público con contraseña válida y cuenta confirmada | auth/service.ts; routes.ts limita intentos. |
| POST /auth/refresh | Poseedor de cookie refresh válida | auth/service.ts bloquea usuario/token, revisa revocación/expiración y rota. |
| POST /auth/logout | Público; revoca el refresh presentado | auth/routes.ts; service.ts. |
| POST /auth/logout-all | A/S/G/U autenticados | routes.ts, lockUser y revokeSessions para r.user.id. |
| POST /auth/confirm-email | Poseedor de token de confirmación | routes.ts; service.ts revisa tipo, caducidad, uso y destino. |
| POST /auth/resend-confirmation | Público | routes.ts; service.ts solo emite para cuenta activa sin confirmar. |
| POST /auth/forgot-password | Público | routes.ts; service.ts devuelve respuesta genérica. |
| POST /auth/reset-password | Poseedor de token de recuperación | routes.ts; service.ts consume bajo lock y revoca refresh. |
| GET /me | A/S/G/U, propio | me/routes.ts devuelve r.user filtrado por publicUser. |
| PATCH /me | A/S/G/U, propio | me/routes.ts, body estricto solo perfil; service.ts actualiza id autenticado. |
| PATCH /me/password | A/S/G/U, propio y contraseña actual | me/routes.ts; service.ts verifica password y revoca otros refresh. |
| PATCH /me/email | A/S/G/U, propio y contraseña actual | me/routes.ts; service.ts deja pendingEmail y envía confirmación. |
| PUT /me/avatar | A/S/G/U, propio | me/routes.ts; avatar.ts usa r.user.id y lockUser. |
| DELETE /me/avatar | A/S/G/U, propio | me/routes.ts; avatar.ts usa id autenticado. |
| GET /files/avatars/:name | Público con nombre UUID conocido | me/routes.ts sin authenticate; regex de nombre y fila kind=avatar en avatar.ts. Es acceso público por URL, no protección por rol. |
| GET /me/notification-preferences | A/S/G/U, propio | notifications/routes.ts; service.ts filtra userId. |
| PATCH /me/notification-preferences | A/S/G/U, propio | routes.ts body estricto; service.ts filtra userId. |
| GET /users/lookup | A/S/G | users/routes.ts requireRole; cédula exacta, activo/no borrado; proyección de cinco campos. |
| GET /users | A | users/routes.ts; service.ts aplica filtros/paginación y publicUser. |
| GET /users/:id | A | users/routes.ts; findUser excluye eliminados y proyecta publicUser. |
| POST /users | A | users/routes.ts; schema.createUserBody controla campos/rol; service.ts. |
| PATCH /users/:id | A | users/routes.ts; service.ts revalida al actor bajo lock, impide autoexpulsión y protege último admin. |
| DELETE /users/:id | A | users/routes.ts; mismo changeUser, soft delete y revocación. |

### Plantillas y variables

Evidencia en api/src/modules/contracts/catalog.ts, salvo esquemas en schemas.ts.

| Endpoint | Roles / recurso | Comprobación real |
|---|---|---|
| GET /variables | A/S/G; G solo variables de plantillas activas | requireRole en ; selección y filtro . |
| POST /variables | A/S | write=requireRole en ; variableInput y opciones select . |
| PATCH /variables/:id | A/S | write; UUID, advisory lock y bloqueo de renombrado si plantilla la usa . |
| DELETE /variables/:id | A/S | write; UUID y uso en plantillas ; omite contratos históricos, H08. |
| GET /templates | A/S/G; G solo activas | read; filtro forzado por rol . |
| POST /templates/preview | A/S/G; G solo variables disponibles en activas | read; Zod y filtro . |
| GET /templates/:id | A/S/G; G solo activa | read; UUID y comprobación de estado . |
| POST /templates | A/S | write; templateInput, lock y resolveVariables . |
| PATCH /templates/:id | A/S | write; UUID, lock y esquema . |
| PATCH /templates/:id/status | A/S | mismo handler; enum estricto . |
| POST /templates/:id/duplicate | A/S | write; copia como inactive . |
| DELETE /templates/:id | A/S | write; impide borrar si hay contratos . |

### Contratos, historial y firmas

R=api/src/modules/contracts/routes.ts; S=service.ts; A=actions.ts; F=signatures.ts; P=pdf.ts, en el mismo módulo.

| Endpoint | Roles / recurso | Comprobación real |
|---|---|---|
| GET /contracts | A/S/G; G solo propios | R filtra createdBy con r.user.id. U no accede a lista global. |
| GET /contracts/counts | A/S/G; G solo propios | R mismo filtro de creador. |
| POST /contracts | A/G | R requireRole; para G exige plantilla activa, creador sale de r.user.id. |
| GET /contracts/:id | Lectura C | R ejecuta linkSignatories y canRead; ajenos reciben 404. |
| PATCH /contracts/:id | A o G creador, draft/rejected | R exige rol, propiedad, permissions.edit y FOR UPDATE. |
| DELETE /contracts/:id | A con código; G creador solo draft | R; S. A confirma código exacto. |
| POST /contracts/:id/submit | A o G creador, draft/rejected | R verifica Lectura C y lock; A verifica can.submit y transición. |
| POST /contracts/:id/approve | A o S que no sea creador; pending_approval | A verifica rol/creador, transición y aprobación pendiente. |
| POST /contracts/:id/reject | A o S que no sea creador; pending_approval | A; comentario obligatorio. |
| POST /contracts/:id/cancel | Gestión C; pending_signatures/active/expiring_soon | A, cancelInput y transition. |
| POST /contracts/:id/uncancel | A; cancelled con previousStatus restaurable | A; state-machine.ts. |
| POST /contracts/:id/archive | Gestión C | A, can.archive; impide repetir mismo flag. |
| POST /contracts/:id/unarchive | Gestión C | mismo handler que archive. |
| POST /contracts/:id/override-status | A | A exige motivo/estado y overrideTransition; auditoría en R. Puede activar sin completar firmas por facultad administrativa explícita. |
| POST /contracts/:id/remind | Gestión C; firmante pendiente en turno | A exige pending_signatures, turno y límite persistente de 1/h. |
| POST /contracts/:id/decline | Firmante vinculado, pendiente; pending_signatures | A exige pertenencia, estado y motivo; no exige turno para declinar. |
| GET /contracts/:id/versions | Lectura C | R llama detail antes de leer historial. |
| GET /contracts/:id/versions/:n | Lectura C | R valida UUID/n positivo, llama detail y filtra contrato/versión. |
| GET /contracts/:id/audit | Lectura C | R llama detail; consulta por contractId con paginación. |
| GET /contracts/:id/approvals | Lectura C | R llama detail; consulta por contractId. |
| GET /approvals | A/S | R requireRole; todas las aprobaciones, también propias en la lista; decidir las propias sigue prohibido al supervisor. |
| GET /me/signatures | A/S/G/U; solo filas de firmante propio | F linkSignatories y where userId; respuesta excesiva H12. |
| POST /contracts/:id/sign | Firmante propio pendiente y en turno; pending_signatures | F bloquea contrato, exige userId, impide repetir y comprueba permissions.sign y viewedAt. |
| GET /files/signatures/:id | A/S, creador o firmante de ese contrato | F exige auth, kind=signature y permiso derivado de file.contractId. El creador se admite sin condicionar su rol actual a G. |
| GET /contracts/:id/pdf | Lectura C | P canRead; final exige nombre de versión actual e integridad SHA-256. |

### Renovaciones, notificaciones, panel, reportes y sistema

| Endpoint | Roles / recurso | Comprobación real y evidencia |
|---|---|---|
| GET /renewals/eligible | A/S, creador o firmante vinculado | renewals/queries.ts filtra por identidad, estado renovable y ausencia de renovación en curso. No vincula firmantes pendientes en esta lectura. |
| GET /renewals | A/S, G creador o solicitante | renewals/queries.ts scope en SQL, filtros y paginación. |
| POST /renewals | Lectura C del original, estado renovable | renewals/service.ts linkSignatories, lock, canRead, fechas y ausencia de renovación en curso. |
| POST /renewals/:id/approve | A/S o creador del original | renewals/service.ts bloquea original/solicitud, comprueba procesador y pending. No hay exclusión del solicitante como procesador. |
| POST /renewals/:id/reject | A/S o creador del original | mismo control ; routes.ts exige respuesta. |
| POST /renewals/:id/cancel | Solo solicitante | service.ts requestedBy===r.user.id y pending. |
| GET /notifications/unread-count | A/S/G/U, propias | notifications/routes.ts; service.ts userId autenticado. |
| GET /notifications | A/S/G/U, propias | routes.ts; service.ts filtra userId y pagina. |
| POST /notifications/read-all | A/S/G/U, propias | routes.ts; service.ts filtra userId. |
| POST /notifications/:id/read | A/S/G/U, propia | routes.ts; service.ts une id con userId; ajenas 404. |
| DELETE /notifications/:id | A/S/G/U, propia | mismo filtro id+userId. |
| POST /events/ticket | A/S/G/U autenticados | notifications/events.ts emite ticket aleatorio asociado a usuario/rol por 30 s. |
| GET /events | Poseedor de ticket válido, un uso | events.ts consume ticket, revalida usuario/rol y suscribe solo user.id; H06 limita su revocación posterior. |
| GET /dashboard | A/S/G/U autenticados | dashboard/routes.ts selecciona implementación por rol de BD, no query; gestor filtra creador y user filtra s.user_id. |
| GET /reports/contracts | A/S/G; G solo propios | reports/routes.ts; service.ts filtra actor/creador. |
| GET /reports/contracts/export | Igual que reporte contracts | routes.ts llama al mismo servicio. |
| GET /reports/users | Solo A | ruta admite staff, pero reports/service.ts exige A. |
| GET /reports/users/export | Solo A | mismo userReport exige A. |
| GET /reports/approvals | A/S/G; G solo aprobaciones de propios | service.ts restringe c.created_by. |
| GET /reports/approvals/export | Igual que reporte approvals | mismo servicio. |
| GET /system/settings | A | system/routes.ts requireRole. |
| PATCH /system/settings | A | routes.ts requireRole y settingsSchema. |
| POST /system/mail/test | A | system/routes.ts, requireRole y body estricto con email; encola correo y responde 202. |
| GET /system/jobs | A | routes.ts requireRole. |
| POST /system/jobs/:name/run | A | routes.ts requireRole y enum; jobs/index.ts advisory lock. |

## Hallazgos verificados

### Alta

#### H01 — Apropiación de contratos y firmas mediante cédula declarada por el usuario

**Ubicación/evidencia:** api/src/modules/contracts/service.ts:83 actualiza firmantes con userId nulo si coincide email **o** cédula; canRead y permissions usan ese vínculo. api/src/modules/me/routes.ts:16 permite editar cedula; api/src/modules/me/service.ts:15 la persiste sin verificar titularidad. api/src/modules/users/schemas.ts:9 y api/src/lib/validation/identity.ts:4 comprueban formato/dígito y normalizan; no acreditan la identidad de quien declara el número. La unicidad en users tampoco acredita titularidad.

**Escenario:** existe un contrato con un invitado aún no registrado, email de la víctima, cédula conocida y userId nulo. Un atacante confirma su propio correo, pone en su perfil esa cédula todavía libre y llama GET /me/signatures. linkSignatories le asigna el firmante pese a no controlar el email de la víctima. Obtiene el contrato y sus archivos/historial y, cuando corresponda el turno, puede firmar como ella. También puede reservar esa cédula antes de crear futuros contratos: reconcileSignatories acepta coincidencia por cédula en service.ts. No afecta por esta vía a un vínculo ya ocupado; el escenario exige invitado sin vincular o coincidencia durante la creación.

**Corrección propuesta:** vincular invitaciones automáticamente solo por correo confirmado o por aceptación de una invitación de un uso ligada a contrato/firmante/usuario. Una cédula editable no debe otorgar acceso; cualquier vínculo por documento de identidad debe requerir una verificación de titularidad independiente. Revisar los vínculos existentes y garantizar un único firmante por usuario/contrato. La validación de formato de T06 ya está presente y no resuelve la titularidad.

**Test nuevo:** sí. Cuenta con correo distinto y cédula del invitado no obtiene la invitación ni el contrato; repetir para perfil editado y para creación de contrato. Añadir caso correo de un invitado/cédula de otro y rechazo de vínculo doble.

#### H02 — Logout y cambio/restablecimiento de contraseña dejan válidos los JWT emitidos

**Ubicación/evidencia:** api/src/plugins/auth.ts:25 consulta solo users y después copia payload.sid; no consulta revocación de sesión ni versión de credenciales. api/src/modules/auth/service.ts:18, api/src/modules/auth/service.ts:193 y api/src/modules/me/service.ts:34 revocan refresh_tokens. api/src/lib/auth/jwt.ts:12 fija 15 minutos. El nuevo guard mustChangePassword no corrige la revocación de cuentas normales.

**Escenario:** se conserva un access token de una sesión; después de logout, logout-all o reset de contraseña, ese mismo bearer sigue cumpliendo authenticate hasta su exp, si el usuario sigue activo y con igual rol. Permite leer contratos o registrar una firma después del cierre/revocación. El cambio de contraseña del perfil conserva intencionadamente la sesión actual, pero el bearer de otra sesión tampoco se rechaza.

**Corrección propuesta:** identificar una sesión estable/familia y verificar su estado activo en cada autenticación, o usar una versión/fecha de invalidación de credenciales junto a revocación por sesión. Coordinarlo con la rotación: no basta con rechazar todo sid cuya fila refresh esté reemplazada, pues cada refresh rota esa fila. Logout debe revocar la sesión/familia correcta; reset y logout-all, todas las correspondientes. Mantener la sesión actual solo cuando la política lo permita.

**Test nuevo:** sí. Bearer anterior rechazado tras logout, logout-all, detección de reuso y reset; cambio de contraseña rechaza bearer de otra sesión y conserva la actual. Mantener comprobación de rol/inactividad, que sí existe.

### Media

#### H03 — Se persisten firmas con cabecera PNG válida pero imagen corrupta

**Ubicación/evidencia:** api/src/modules/contracts/signatures.ts:70 valida solo longitud mínima, magic, IHDR y dimensiones no nulas; api/src/modules/contracts/signatures.ts:97 persiste antes de decodificar. Solo la última firma llama saveFinalPdf. api/src/modules/contracts/pdf.ts:60 incorpora todas las imágenes. El decodificador instalado también se leyó: api/node_modules/pdfkit/js/pdfkit.js:4767 y api/node_modules/png-js/lib/png-js.js:140.

**Escenario:** el primer firmante de un contrato con dos participantes envía una imagen truncada tras los 24 bytes que cumplen el filtro. Su firma se confirma sin decodificación. La última firma intenta generar el PDF con aquella imagen y falla; se revierte la última operación, pero permanece la primera firma corrupta y no puede repetirse porque ya figura signed. También falla el PDF provisional. No se ejecutó este payload ni se afirma una caída del proceso.

**Corrección propuesta:** decodificar y recodificar a PNG antes de persistir, con límite explícito de ancho/alto/píxeles y memoria; mapear errores a 400. El tamaño comprimido de 500 KiB no limita la imagen descomprimida. Aplicar validación completa a avatares/logo si deben garantizarse imágenes visualizables.

**Test nuevo:** sí. PNG truncado que supera la cabecera, dimensiones excesivas e imagen decodificable; comprobar rechazo sin fila/file/firma parcial y finalización con varias firmas.

#### H04 — Cambiar de email evita cualquier presupuesto global de login por IP

**Ubicación/evidencia:** api/src/modules/auth/routes.ts:57 limita por IP+email; api/src/app.ts:49 configura 100/min global. El plugin instalado elige configuración de ruta **o** global y un store hijo (api/node_modules/@fastify/rate-limit/index.js:173). api/src/modules/auth/service.ts:121 realiza Argon2 también para cuentas inexistentes; api/src/lib/auth/password.ts:5 fija memoryCost 65536.

**Escenario:** una misma IP envía un intento por cada email distinto. Cada clave está por debajo de 5/min y no consume un contador global adicional de IP; nginx tampoco define limit_req en el archivo revisado. Permite password spraying y trabajo costoso de Argon2 sin ese límite agregado. No se simuló carga ni se estimó capacidad del servidor.

**Corrección propuesta:** presupuestos independientes por IP y por cuenta/email, con límite de concurrencia del trabajo de contraseña. Si se aplica en nginx y aplicación, documentar ambos controles sin desactivar el límite por cuenta; conservar IP real validada.

**Test nuevo:** sí. Más de N emails distintos desde una IP agotan el límite agregado, mientras cuentas/IP legítimas conservan su presupuesto previsto.

#### H05 — Enumeración pública de correos y cédulas

**Ubicación/evidencia:** api/src/modules/auth/routes.ts:46 devuelve disponibilidad de email/cédula sin autenticación. api/src/modules/auth/service.ts:84 inserta sin respuesta opaca y api/src/lib/errors.ts:79 distingue duplicado de email/cédula con 409. La validación nueva de cédula exige un número sintácticamente válido pero no suprime el oráculo.

**Escenario:** sin cuenta se comprueba si un correo o una cédula concreta está registrada. Incluye filas inactivas/eliminadas, porque availability no las filtra. El límite de 20/min reduce velocidad pero conserva el oráculo; el registro ofrece otro canal. Puede usarse para descubrir pertenencia al sistema y preparar ataques dirigidos. El login sí usa error genérico ante contraseña incorrecta; no se reporta como enumeración por mensaje de login.

**Corrección propuesta:** retirar la comprobación pública de cédula y hacer opaco el registro para identificadores existentes; enviar instrucciones al correo cuando corresponda. Si se decide mantener disponibilidad de email por UX, documentar esa revelación y limitar su alcance; no devolver identificación nacional pública por defecto.

**Test nuevo:** sí. Misma forma/código de respuesta externa ante cuenta existente o inexistente, sin indicar qué identificador existe.

#### H06 — Una conexión SSE conserva acceso tras revocar la sesión

**Ubicación/evidencia:** api/src/modules/notifications/events.ts:17 guarda userId/role/expiración, sin sesión; api/src/modules/notifications/events.ts:35 valida usuario al abrir; api/src/modules/notifications/events.ts:56 suscribe user.id indefinidamente con heartbeat. Logout y revokeSessions no cierran conexiones. El cierre por eventos de sesión de src/lib/api/server-events.ts:90 solo coopera en el cliente.

**Escenario:** un cliente que ya abrió SSE mantiene la conexión después de logout-all o reset y continúa recibiendo notificaciones futuras del mismo usuario. No necesita renovar JWT ni reutilizar ticket; el flujo continúa mientras permanezca conectado. El heartbeat impide interpretar el timeout de lectura nginx como caducidad absoluta. No hay cruce de userId confirmado: el fallo es la duración del acceso revocado.

**Corrección propuesta:** asociar ticket/conexión a sesión estable y exp/versión de autenticación; cerrar desde el servidor al revocar y revalidar periódicamente. Fijar duración máxima que fuerce nuevo ticket autenticado. En varias instancias, propagar revocación/eventos por un canal compartido.

**Test nuevo:** sí. Abrir SSE, revocar desde otra sesión y comprobar cierre sin entregar una notificación posterior; repetir para inactividad/cambio de rol y caducidad absoluta.

#### H07 — Un enlace de recuperación anterior sigue activo después de cambiar la contraseña

**Ubicación/evidencia:** api/src/modules/me/service.ts:33 cambia passwordHash y mustChangePassword, y después refresh_tokens; no invalida auth_tokens. api/src/modules/auth/service.ts:229 valida uso/expiración sin ligarlo a la versión de contraseña. issueAuthToken concede una hora a password_reset.

**Escenario:** se solicita recuperación y se conserva/intercepta su enlace. El titular cambia legítimamente la contraseña desde su perfil antes de consumir el enlace. El enlace anterior sigue permitiendo sobrescribir la nueva contraseña hasta su caducidad; el cambio de contraseña no lo invalida. El token continúa siendo de un uso: no se afirma reutilización después de consumirlo.

**Corrección propuesta:** invalidar todos los password_reset pendientes al cambiar contraseña dentro de la misma transacción/lock, o vincularlos a una versión de credenciales. Considerar también cancelar confirmaciones de cambios de email pendientes al recuperar una cuenta comprometida.

**Test nuevo:** sí. Emitir recuperación, cambiar contraseña por /me/password y verificar que el enlace previo es inválido.

#### H08 — Borrar una variable que ya salió de la plantilla bloquea renovar contratos anteriores

**Ubicación/evidencia:** api/src/modules/contracts/catalog.ts:80 y la consulta siguiente protegen eliminación solo por uso en plantillas actuales. El mismo archivo permite editar contenido/recalcular variables. api/src/modules/renewals/service.ts:207 vuelve a resolver las definiciones actuales sobre content histórico; api/src/modules/contracts/catalog.ts:24 rechaza nombres desaparecidos. La validación nueva de prepareContent no añade snapshot de definiciones.

**Fallo concreto:** plantilla con variable X crea un contrato que llega a active. Un supervisor retira X de la plantilla actual y luego borra X, operación permitida. Al aprobar la renovación de aquel contrato, resolveVariables no encuentra X y la transacción del hijo falla con 400. No se puede corregir el contenido de un contrato activo por edición ordinaria. Alterar tipo/opciones/requerido de una definición también puede invalidar valores históricos.

**Corrección propuesta:** versionar/snapshot de las definiciones de variables junto al documento y usar esa versión al renovar, o impedir borrados/cambios incompatibles mientras existan contratos que dependan de ellas. No limitar el análisis de uso a la plantilla actual.

**Test nuevo:** sí. Contrato activo con plantilla v1, plantilla v2 sin X, intento de borrar X y renovación: impedir la operación incompatible o renovar usando definición histórica.

#### H09 — El dump de BD y storage no forman una copia consistente durante escrituras

**Ubicación/evidencia:** deploy/backup/backup.sh:49 seguido de tar de storage sin exclusión de mutaciones de API; .backup-lock solo excluye otro backup. api/src/modules/me/avatar.ts:91 borra el avatar anterior; api/src/modules/contracts/routes.ts:334 elimina físicamente archivos después de borrar el contrato.

**Fallo concreto:** el snapshot de pg_dump incluye un contrato y sus firmas. Antes de que tar las copie, un admin elimina el contrato y se eliminan las imágenes/PDF. Al restaurar la pareja de archivos, la BD recupera las referencias del snapshot pero storage no tiene esos archivos; firmas/PDF quedan irrecuperables desde ese juego. El mismo problema afecta al reemplazo de avatar. Los checksums solo prueban integridad de archivos guardados, no coherencia BD/storage.

**Corrección propuesta:** ventana de mantenimiento que detenga mutaciones mientras se captura ambos, snapshot coordinado de volúmenes, o almacenamiento inmutable con retención de borrados durante la captura. Documentar restauración y comprobar referencias contra los objetos del juego antes de considerarlo recuperable.

**Test nuevo:** sí, prueba de backup/restauración en entorno aislado con cambios/borrados concurrentes controlados; nunca sobre la BD compartida de esta tarea.

#### H10 — El primer administrador con contraseña temporal no puede completar el acceso web

**Tipo:** fallo funcional de integración.

**Ubicación/evidencia:** api/src/db/create-admin.ts:37 crea la cuenta obligada a cambiar contraseña. api/src/plugins/auth.ts:37 devuelve PASSWORD_CHANGE_REQUIRED salvo PATCH /me/password. El login incluye el flag, pero src/lib/api/core-types.ts:39 no lo modela y no existe manejo de mustChangePassword/PASSWORD_CHANGE_REQUIRED en el código web consultado. src/lib/auth/useSessionState.ts:27 carga /me y su catch publica session-expired ante el 403; el router carece de una pantalla autenticada para contraseña temporal.

**Fallo concreto:** el administrador creado por el nuevo comando introduce correctamente su contraseña temporal. La restauración/carga de perfil pide /me, que el guard rechaza; el front termina la sesión en memoria en lugar de mostrar un formulario de cambio. El backend permite cambiarla por petición API directa, pero el usuario no puede completar el flujo web previsto. Esto no justifica eliminar la obligación de cambiarla.

**Corrección propuesta:** estado de autenticación restringida que conserve el bearer y el flag; ruta y formulario para PATCH /me/password; tratar PASSWORD_CHANGE_REQUIRED de forma específica. Permitir un perfil mínimo en esa sesión si el flujo lo necesita y bloquear el resto hasta completar el cambio.

**Test nuevo:** sí. Crear primer administrador, login web con contraseña temporal, cambiarla y acceder al panel; recarga antes de cambiarla conserva un flujo útil sin habilitar acciones de negocio.

#### H11 — El outbox guarda tokens de recuperación/confirmación en claro mientras están pendientes o fallidos

**Ubicación/evidencia:** api/src/modules/auth/service.ts:61 entrega el token crudo al payload del correo. api/src/lib/mail/outbox.ts:13 inserta ese payload directamente en email_outbox; la migración api/drizzle/0006_t08_mail_outbox.sql:6 lo almacena en JSONB. api/src/jobs/email-dispatch.ts:25 lo borra después de envío exitoso, pero la rama de error conserva el payload tanto en pending como failed. api/src/jobs/cleanup.ts:31 solo elimina enviados antiguos.

**Escenario/impacto:** un acceso de solo lectura a la BD o una copia hecha mientras un correo de reset está pendiente/fallido revela el token utilizable durante su vigencia (una hora para reset, 24 horas para confirmación). auth_tokens almacena hashes, pero ya no es el único lugar que contiene el secreto: la cola permite obtener el token original sin romper el hash. No se consultó ningún payload real ni se extrajeron tokens. Después de entrega exitosa sí se limpia; no se afirma que se retengan todos los tokens enviados.

**Corrección propuesta:** cifrar el payload sensible con una clave fuera de la BD, limitar la retención a la vigencia necesaria y eliminarlo al fallo terminal/expiración. Mantener únicamente identificador/estado de entrega en el historial y documentar el acceso restringido a la cola y sus backups. No reemplazar el hash de auth_tokens por texto claro.

**Test nuevo:** sí. Verificar que el secreto crudo no se almacena legible, que la entrega puede reconstruirlo con el mecanismo autorizado y que se elimina tras éxito, fallo terminal o caducidad sin aparecer en logs.

### Baja

#### H12 — Las listas de firmas y renovaciones devuelven contratos completos

**Ubicación/evidencia:** api/src/modules/contracts/signatures.ts:42 extiende decorate y este devuelve ...contract (api/src/modules/contracts/service.ts:298). api/src/modules/renewals/queries.ts:23 selecciona contratos completos; listRenewals también anida la fila completa. Incluyen contenido, variables y metadatos de PDF. El tipo de bandeja extiende Contract en src/lib/api/contract-types.ts:158.

**Escenario/impacto:** al cargar una bandeja se transfieren todos los documentos y metadatos, que quedan en memoria/caché de consultas aunque la pantalla solo necesite resumen. Aumenta exposición accidental y coste de cada listado. **No es un IDOR adicional confirmado:** estos usuarios ya cumplen la política de lectura del contrato; la ruta interna del PDF tampoco equivale a acceso público al disco.

**Corrección propuesta:** DTO explícito por lista, con los campos consumidos y sin contenido/rutas internas; pedir el documento al abrir el detalle. Ajustar tipos de bandeja y renovación, no solo ocultar campos en UI. Añadir paginación a listas que hoy devuelven todo cuando el volumen lo requiera.

**Test nuevo:** sí. Verificar ausencia de campos de documento/storage en respuestas de lista y conservar campos de resumen/turno.

### Info

#### H13 — El destino inicial del firmante todavía no tiene ruta de bandeja

**Ubicación/evidencia:** src/app/navigation.ts:67 devuelve /app/firmas; src/app/guards.tsx:46 redirige allí. src/app/router.tsx:66 es el destino efectivo al no existir registro de firmas. api/src/lib/mail/templates/index.ts:47 también manda al mismo destino. Es integración pendiente conocida, no una vulnerabilidad.

**Fallo concreto:** al entrar como U o volver después de firmar se muestra NotFound, aunque el endpoint y hook de firmas existan. Es integración de frontend expresamente pendiente en HANDOFF, no una vulnerabilidad ni una regresión atribuida a esta tarea. Otras opciones del menú también están todavía sin pantalla registrada.

**Corrección propuesta:** registrar la bandeja que consume useSignatures y los destinos de navegación implementados; mientras se integra, dirigir al usuario a una pantalla existente útil.

**Test nuevo:** sí, navegación desde login como U y retorno después de firmar; ejecutar cuando la pantalla esté implementada.

## Revisado sin hallazgo adicional confirmado

Estas comprobaciones son estáticas; no equivalen a pruebas de penetración ni a tests aprobados.

- **JWT, rol y contraseña:** algoritmo HS256, issuer/audience y exp de 15 min fijados; secreto obligatorio con longitud mínima, sin valor por defecto. Argon2id y hash ficticio en login para usuario inexistente. Relectura de usuario/rol, actividad y confirmación de email por petición. Registro fija role=user, PATCH /me no admite rol y administración impide autoexpulsión/pérdida del último admin bajo locks. El rol cambiado y la cuenta desactivada sí bloquean JWT; H02 se refiere a sesiones revocadas con cuenta/rol aún válidos. No se midieron tiempos constantes extremo a extremo.
- **Refresh y email:** tokens aleatorios de 32 bytes; hashes en auth_tokens/refresh_tokens. Rotación bajo lock con familia y detección de reuso; gracia explícita de 15 s devuelve 409 sin nuevo token. Consumo de tokens de correo comprueba propósito, uso, expiración y cuenta bajo lock; nueva emisión invalida los anteriores de igual propósito. H07 trata el cambio de contraseña posterior a la emisión; H11 trata la copia cruda en la cola.
- **Cookie/CSRF:** httpOnly, secure en producción, sameSite=lax y path /api/v1/auth. app.ts rechaza Origin distinto de APP_URL en mutaciones y CORS permite solo ese origen. Origin ausente se admite; no se confirmó un bypass de navegador con la combinación observada. Las rutas de negocio exigen bearer, no solo cookie. No se atribuye protección CSRF a CORS por sí solo.
- **Permisos e IDOR:** contrato/historial/PDF y archivos de firma verifican relación de recurso; notificaciones combinan id con userId. Gestores tienen ámbito de creador en reportes/contratos, reporte de usuarios exige admin en servicio. Renovaciones filtran según solicitante/creador/participante. No se confirmó acceso ajeno cambiando solo UUID, aparte del vínculo inseguro H01. El avatar es público por URL UUID, no requiere sesión; no se presupone que sea un archivo privado.
- **Aprobación/firmas/estados:** supervisor no aprueba ni rechaza su propio contrato, override exige admin/motivo. Escrituras y firmas bloquean contrato FOR UPDATE y revalidan estado/turno/no repetición. Cancelar/restaurar usa máquina de estados. La activación administrativa sin todas las firmas es facultad explícita auditada, no un bypass de un firmante. Declinar exige pertenencia/pendiente pero no turno; no se inventó una restricción de negocio ausente.
- **Documento firmado:** edición ordinaria solo draft/rejected, incrementa versión y crea snapshot; reconciliación reinicia marcas actuales de firma. Aprobación guarda versión. Firma exige viewedAt no futuro y posterior a updatedAt. El cliente no aporta hash/versión explícito: la garantía observada depende de la inmutabilidad mientras pending_signatures, no de prueba criptográfica de lectura real. PDF final guarda/verifica SHA-256 y nombre de versión.
- **Renovaciones/jobs:** original y solicitud se bloquean; se comprueban estado/pending y ausencia de renovación en curso; índice único parcial para pendientes. Hijo nace draft con snapshot y firmantes pendientes. Su última firma activa hijo y marca padre renewed en la misma transacción, condicionada a solicitud approved. Jobs usan advisory lock por nombre liberado sobre la misma conexión; email-dispatch también usa filas SKIP LOCKED. Ledger único de avisos evita duplicados incluso tras borrar notificaciones.
- **Entrada/SQL:** esquemas Zod o parse manual en entradas relevantes; multipart y query final del PDF tienen validación manual. pageSize paginado máximo 100; algunas listas no paginan. Reportes usan SQL parametrizado y mapas cerrados para agrupación. sql.raw de orden solo recibe asc/desc constante tras enum; db/reset usa SQL fijo en herramienta restringida. next_contract_code usa format %I/%L y advisory lock. No se confirmó inyección SQL. Los validadores nuevos normalizan identidad/contacto/montos/fechas; validar documento nacional no acredita titularidad.
- **Límites/archivos:** bodyLimit 2 MiB, avatar 2 MiB y firma 500 KiB; nginx deja margen de 3 MiB. Nombres/rutas generados y restringidos por regex; nombre de cliente no decide ruta. Avatares comparan magic/MIME, firmas comprueban cabecera con insuficiencia H03. No se confirmó traversal. Descarga de firma tiene no-store/nosniff; PDF/exportación tiene attachment de nombre controlado, no-store y nosniff por Helmet/nginx. pdfmake bloquea URLs remotas y restringe lectura local a fuentes; PDF se construye con texto, no HTML arbitrario. No se confirmó SSRF.
- **Exportadores:** CSV escapa comillas y neutraliza prefijos de fórmula; XLSX usa valores primitivos y no objetos de fórmula; PDF usa texto de pdfmake. No se confirmó inyección HTML en la exportación nueva.
- **Fugas/logs/SSE:** publicUser excluye hashes/tokens; manejador de error no devuelve SQL/traza y registra solo tipo. nginx omite argumentos/Referer y evita error log de tickets SSE. Ticket aleatorio/hash, 30 s y un uso, validación al abrir y suscripción por user.id; efectos de notificación se publican tras commit. H06 limita la revocación posterior. EventBus/tickets son locales a proceso; no se certifica escalado a varias réplicas. No se inspeccionaron logs ni payloads reales.
- **Web:** access token en memoria y BroadcastChannel sin persistencia; refresh en cookie; caché se limpia al login/logout/expiración. apiUrl usa destino relativo fijo /api/v1. Guardas cliente se complementan con servidor. No se halló uso explotable de dangerouslySetInnerHTML/document.write en el flujo nuevo; DocumentView decodifica contenido ya escapado a textContent y lo muestra en nodos React. Los sumideros del árbol antiguo no se reportan como alcanzables desde la nueva entrada. El from de login se produce con pathname+search en estado local; no se identificó origen atacante para un next externo y no se reporta redirección abierta sin él.
- **Despliegue:** CORS restringido, Helmet y CSP nginx sin unsafe-inline/unsafe-eval, nosniff y protección de frames. Proxy sobrescribe X-Forwarded-For con remote_addr y Compose confía un salto; API/BD no publican puertos al host. API usa USER node, cap_drop ALL y no-new-privileges; nginx usa workers nginx y backup root expresamente para propietarios. Contextos Docker excluyen .env y logs. No se comprobaron valores reales de secretos.
- **Backups:** umask 077, exclusión entre backups, publicación al completar dump/tar/checksum, retención limitada, restauración con confirmación de BD/storage vacío/checksum. H09 limita coherencia con escrituras. No se hizo restauración ni se comprobó copia fuera del host.

## Correcciones concurrentes comprobadas y descartadas como hallazgos vigentes

- **Escucha Docker:** api/src/server.ts:6 usa HOST validado y docker-compose.prod.yml:18 lo fija a 0.0.0.0. Se retiró el bloqueo anterior por loopback fijo.
- **URL de tests:** api/src/config/env.ts:11 es opcional y se exige solo para NODE_ENV=test. No se reporta como requisito de producción.
- **Entrega de correo:** addNotification encola dentro de transacción; api/src/jobs/email-dispatch.ts:29 distingue error temporal/permanente, reintenta y limita intentos. Resend recibe clave de idempotencia. SMTP mantiene posibilidad de duplicado si el envío externo tiene éxito y falla el commit; no se afirma entrega exactamente una vez. Se retiró el hallazgo anterior de error SMTP tragado sin outbox.
- **URLs de contrato:** api/src/lib/mail/templates/index.ts:50 construye /app/contratos/:id. La firma manda a /app/firmas, cuya integración pendiente está en H13; no se conserva el fallo anterior de /contratos/:id sin /app.
- **Transporte log:** api/src/lib/mail/transports.ts:94 registra destinatario/asunto/tipo, no cuerpo ni token. Producción prohíbe MAIL_DRIVER=log. No se conserva el hallazgo anterior de impresión de enlaces de auth.

## Verificación y entrega

No se aplicaron correcciones ni se escribieron tests. Las propuestas de test son para tareas posteriores; no deben ejecutarse sobre la BD compartida sin coordinación. Los archivos modificados por otros trabajos se releyeron antes de cerrar y las evidencias se contrastaron contra su contenido actualizado. Persisten los límites indicados para scripts de credenciales, runtime, dependencias y snapshots generados. La auditoría escribió únicamente este informe.
