# T14 — Segunda auditoría global de la API

Fecha: 10 de noviembre de 2026. Revisión estática y de solo lectura.

## Resultado

**18 hallazgos: 0 críticos, 3 altos, 12 medios, 2 bajos y 1 mejora.** Prioridades: conservar contratos aprobados aunque todavía no tengan firmas, impedir autoaprobaciones y registrar de forma persistente los cambios de usuarios y otros objetos administrativos. No se aplicó ninguna corrección.

Base auditada: **51a3e88bfdadbcee950b753df2e5a93fcbd047a0**, HEAD al comenzar. Durante la revisión apareció dcdc5496d450d4b58cc60d08d97aa0b9393e6aa6, exclusivamente de documentación: la comparación de api/src, api/drizzle y api/test entre ambos commits está vacía. Todas las líneas de este informe corresponden a la base auditada, no al árbol de trabajo.

## Método, alcance y límites

- Se leyeron primero CODE_STANDARDS y PRINCIPIOS; después HANDOFF y los informes T07, T09a, T09b, T10, T11 y T12a. PRINCIPIOS prevalece ante discrepancias de tareas anteriores. Las contradicciones se documentan para que Claude las resuelva; no se implementó una política alternativa.
- Se revisaron los 121 archivos de api/src (120 TypeScript y el corpus JSON de validación), sus rutas, consumidores y controles de servicio. Se contrastaron esquema, índices y restricciones de las migraciones commiteadas 0000–0010 y los tests relacionados. Los scripts de seed/mantenimiento se inspeccionaron sin ejecutar y sin reproducir sus literales de credenciales o datos de ejemplo.
- Las lecturas de código se hicieron con git show <commit>:<ruta>; se mantuvo una instantánea en memoria. git status y diferencias de nombres sirvieron para distinguir trabajo concurrente. **Se ignoraron completamente las implementaciones sin commit de T13 y T12b**, incluidas sus migraciones y rutas nuevas. Un hallazgo en usuarios sigue siendo vigente para HEAD aunque T12b pueda corregirlo después; no es una evaluación de su trabajo en curso.
- Única escritura propia: docs/tasks/T14-auditoria-global.REPORT.md. No hubo staging ni commit, tests, typecheck, build, format, npm audit, procesos API, importaciones de módulos de aplicación, peticiones a endpoints del proyecto, jobs, seeds, migraciones ni acceso a bases de datos. No se leyó api/.env ni se inspeccionaron claves, logs o archivos reales de usuarios.
- Se aplicó la habilidad security-best-practices. No contiene una referencia específica de Fastify; las conclusiones se fundamentan en este código. Solo se consultó documentación/código oficial de Fastify, PostgreSQL y Nodemailer para resolver semántica de hooks, fechas y configuración SMTP; las referencias pertinentes se enlazan junto al análisis.
- Los escenarios son deducciones estáticas concretas; no se explotaron ni se midió carga. Las propuestas de pruebas son trabajo futuro. Los resultados de ejecución de informes anteriores no se atribuyen a esta auditoría. No se certifican valores efectivos de producción, CVE, políticas del bucket, restauración de backups, acreditación de certificados ni comportamiento del frontend.

## Hallazgos por gravedad

### Alto

#### H01 — Se puede borrar físicamente un contrato que ya fue aprobado

**Evidencia:** api/src/modules/contracts/service.ts:89–100; api/src/modules/contracts/routes.ts:354–367; api/src/modules/contracts/actions.ts:222–234; api/src/db/schema.ts:250–253 y 298–318.

**Escenario:** un gestor crea y envía un contrato; el supervisor lo aprueba; antes de cualquier firma, un participante declina. El contrato queda rejected, sin everSigned, PDF ni evidencia. permissions.delete devuelve true y DELETE elimina la fila; las FK en cascada eliminan versiones, aprobaciones y participantes. También se puede editar ese rejected para volver a draft y borrarlo. La auditoría sobrevive, pero no sustituye el documento y el historial destruidos. PRINCIPIOS §1 prohíbe borrar lo que ya pasó por aprobación, incluso al admin. La regla de T10 basada solamente en firma/estado no satisface ese caso.

**Corrección propuesta:** mantener una marca irreversible de aprobación efectiva, con backfill desde aprobaciones y evidencia histórica, y comprobarla tanto en can.delete como en el servicio de borrado bajo el bloqueo del contrato. No basta approvedAt actual si importaciones o transiciones pueden dejarlo vacío. Conservar los rejected que nunca llegaron a aprobarse y no tienen firmas según la política permitida.

**Pruebas faltantes:** flujo HTTP aprobar → declinar sin firmar → borrar, y el mismo flujo con edición intermedia; ambos deben conservar todas las filas. api/test/t10-signatures.test.ts:296 cubre estados y everSigned, pero no este historial aprobado sin firmas.

#### H02 — La prohibición de autoaprobar no cubre administradores ni renovaciones

**Evidencia:** api/src/modules/contracts/service.ts:65–67; api/src/modules/contracts/actions.ts:142–146; api/src/modules/renewals/service.ts:158–170. La autoría/responsabilidad se reescribe en api/src/modules/contracts/admin-actions.ts:40–43.

**Escenarios:** (a) un admin crea y envía un contrato y lo aprueba por la ruta ordinaria: el primer término del permiso le exime de la comparación de propietario, sin motivo excepcional; (b) un gestor propietario o un supervisor solicita una renovación y aprueba su propia solicitud: processRenewal nunca compara requestedBy con el actor; (c) usar createdBy, que ahora es el responsable reasignable, como única prueba de autoría pierde la separación histórica tras una reasignación y un cambio de rol. Contradice PRINCIPIOS §3, aunque admin tenga acceso global de lectura y administración.

**Corrección propuesta:** separar responsable actual de creador/solicitante inmutables y denegar la aprobación ordinaria propia en contratos y renovaciones para todos los roles. Si se autoriza una excepción administrativa, encauzarla por una operación explícita con motivo y auditoría excepcional, sin extenderla tácitamente a approve. Alinear can.approve, cola y servicio.

**Pruebas faltantes:** admin sobre su contrato; gestor y supervisor sobre renovación solicitada por ellos; cambio de rol y reasignación entre solicitud y revisión. La concurrencia entre dos revisores distintos de lifecycle.test.ts:165 no comprueba separación de funciones.

#### H03 — Cambios relevantes no dejan auditoría persistente y completa

**Evidencia:** api/src/modules/users/routes.ts:46–78 registra solo actor, objeto y acción en el logger tras el servicio; api/src/modules/users/service.ts:58–76 y 118–141 muta sin audit. api/src/modules/contracts/catalog.ts:38–90 y 150–220 tampoco audita; api/src/modules/system/settings.ts:48–55 persiste ajustes sin actor; api/src/modules/system/routes.ts:51–59 inicia correo/jobs sin identidad persistente del iniciador.

**Escenario:** se cambia un rol, correo o estado de usuario y después se pierde/rota el log operativo. La BD no permite reconstruir quién hizo el cambio, su origen ni los valores anterior/nuevo; incluso con el log disponible faltan esos valores. El proceso puede morir entre el commit y log.info. Algo equivalente ocurre con cambios de plantillas/variables y de datos institucionales que afectan documentos futuros. job_runs acredita ejecución, pero no quién la ordenó. El encadenamiento T10 solo cubre filas que realmente se insertan: no crea estos eventos ausentes.

**Corrección propuesta:** insertar eventos minimizados en la misma transacción que cada mutación relevante, con actor, origen, fecha y cambios permitidos. Nunca copiar contraseñas, hashes, tokens ni secretos. Distinguir ejecución automática de ejecución manual. **Usuarios se coordina con T12b**, sin duplicar sus cambios sin commit; catálogo, sistema y operación manual requieren cobertura adicional.

**Pruebas faltantes:** evento completo por operación y ausencia de evento/cambio tras rollback; cambio de rol y eliminación conservan el evento. Revisar cobertura después de integrar T12b.

### Medio

#### H04 — DTO excesivos exponen datos personales y evidencia técnica

**Evidencia:** api/src/modules/contracts/routes.ts:55–60 extiende todo el firmante; :379–402 devuelve versiones y auditoría con select completo; api/src/modules/contracts/service.ts:206–214 incluye correo/cédula en snapshots y :306–307 extiende el contrato. api/src/modules/users/service.ts:51 usa publicUser, cuya proyección incluye email y cedula en api/src/modules/users/schemas.ts:39–42. api/src/modules/renewals/queries.ts:73 incluye requester.email; api/src/lib/mail/transports.ts:91–95 registra el correo en desarrollo.

**Escenario:** un participante autorizado a leer su contrato obtiene IP y user-agent de los demás en el detalle, y las IP/origen y snapshots completos en el historial. Los listados de usuarios y de renovaciones también incluyen correo/cédula o correo del solicitante. GET /contracts selecciona contratos completos, con contenido, variables, contacto del cliente, ruta del PDF y sobre del sello, aunque la lista solo necesita un resumen. PRINCIPIOS §5 exige minimizar y excluir cédulas, correos e IP de listados/logs. No se afirma un acceso a contratos ajenos ni que un hash de integridad o certificado público sea un secreto de sesión.

**Corrección propuesta:** DTO explícitos por listado, detalle y tipo de historial; separar metadatos de identidad/evidencia de la información necesaria para firmar. Reservar evidencia completa a una consulta justificada y autorizada, enmascarar cuando proceda y no registrar destinatarios completos en logs. Ajustar el contrato frontend de forma coordinada. Mantener los DTO mínimos ya presentes en bandejas de firmas y contratos elegibles.

**Pruebas faltantes:** ausencia de IP/user-agent de terceros en detalle e historial del firmante; listados sin campos personales/documentales prohibidos. Los tests T09b de resumen no cubren estas otras rutas.

#### H05 — Varias escrituras revelan que existe un recurso ajeno

**Evidencia:** api/src/modules/contracts/routes.ts:206–212; api/src/modules/contracts/signatures.ts:72–76; api/src/modules/renewals/service.ts:153–163.

**Escenario:** un gestor hace PATCH sobre un UUID ajeno: el contrato existente produce 403 y el inexistente 404. Cualquier usuario autenticado que envíe un multipart válido a sign distingue del mismo modo un contrato sin participación. Procesar/cancelar una renovación ajena también devuelve 403 después de encontrarla. No concede contenido ni permiso de escritura, pero infringe el 404 uniforme de PRINCIPIOS §3 y sirve como oráculo de existencia con un identificador conocido.

**Corrección propuesta:** verificar primero el alcance de lectura y devolver 404 cuando no hay relación con el recurso; conservar 403 para una operación prohibida sobre un recurso que el actor sí puede conocer. Centralizar ese criterio para evitar diferencias entre rutas.

**Pruebas faltantes:** pares UUID ajeno/inexistente con cuerpo válido en PATCH, sign y acciones de renovación; mismo estado y forma de error.

#### H06 — El logo se descomprime y recodifica antes de autenticar o limitar intentos

**Evidencia:** api/src/modules/contracts/routes.ts:40 registra validateInstitutionLogo en preValidation; api/src/lib/storage-image-validation.ts:15–20 llama sanitizePng; api/src/lib/storage-png.ts:136 y :176 usa inflateSync/recodificación síncrona. La autorización de settings está en preHandler (api/src/modules/system/routes.ts:14 y :44); el límite global también (api/src/app.ts:56).

**Escenario:** una petición sin bearer a PATCH /system/settings, sin Origin o con el permitido, aporta un PNG comprimido de dimensiones máximas dentro de un JSON permitido. Se realizan CRC, inflado y bucles de millones de píxeles antes del 401; incluso una IP que ya agotó el presupuesto puede provocar ese trabajo antes del 429. El tamaño descomprimido sí está acotado: el problema es el orden y trabajo síncrono accesible sin autenticación, no una bomba de memoria ilimitada.

**Corrección propuesta:** autenticar y aplicar un presupuesto temprano antes del procesamiento costoso; poner la validación del logo en un servicio de settings ejecutado tras autorización, evitando el hook cruzado del módulo contratos. Para cargas de este tamaño, limitar concurrencia o sacar el trabajo síncrono del hilo principal.

**Pruebas faltantes:** espía del decodificador que acredite cero invocaciones para peticiones no autenticadas, sin rol o limitadas. El test T09b valida imágenes, no este orden. Orden contrastado con el [ciclo de Fastify](https://fastify.dev/docs/latest/Reference/Lifecycle/) y la [composición de hooks de Fastify 5.12.8](https://raw.githubusercontent.com/fastify/fastify/v5.12.8/lib/route.js).

#### H07 — Faltan presupuestos independientes por cuenta y destino de correo

**Evidencia:** api/src/modules/auth/routes.ts:21–22 y :42–49 limita IP y combinación IP+email; :89–105 limita recuperación/reenvío por IP. api/src/modules/auth/rate-limit.ts:4–10 no recibe cuenta. api/src/modules/me/routes.ts:45–57 no tiene límite específico para cambio de correo; api/src/modules/auth/service.ts:201–207 emite un token nuevo por solicitud.

**Escenario:** muchas IP pueden probar contraseñas contra la misma cuenta sin compartir ningún presupuesto de cuenta. Pueden también solicitar recuperación/reenvío sobre una dirección y generar correo repetidamente, invalidando el enlace anterior en cada emisión. Un usuario autenticado puede repetir cambios a una misma dirección dentro del límite global de 100/min. El semáforo Argon2 de cuatro trabajos reduce agotamiento simultáneo, pero no implementa el límite por cuenta exigido por PRINCIPIOS §4.

**Corrección propuesta:** presupuestos independientes por IP, identidad normalizada y destinatario/propósito, incluyendo cambio de email. Respuestas opacas para no introducir enumeración. Considerar coalescencia y enfriamiento de la outbox para solicitudes repetidas. En despliegues con varias instancias, compartir los contadores o aplicar el límite en un componente común.

**Pruebas faltantes:** misma cuenta desde distintas IP; diferentes cuentas desde una IP; correo de cambio/recuperación repetido sin duplicar envíos ni invalidar indefinidamente enlaces. Conservar los presupuestos agregados T09a existentes.

#### H08 — Orden de bloqueos opuesto entre firma y solicitud de renovación

**Evidencia:** api/src/modules/contracts/signatures.ts:72–73 y api/src/modules/contracts/routes.ts:301–302 bloquean contrato antes de linkSignatories; api/src/modules/renewals/service.ts:89–90 llama linkSignatories antes de bloquear contrato. api/src/modules/contracts/identities.ts:11 bloquea usuario y :24 los firmantes invitados.

**Escenario:** el mismo participante inicia dos peticiones. A obtiene el contrato para firmar; B obtiene el usuario en requestRenewal. A intenta bloquear el usuario y B intenta bloquear ese contrato: se forma un ciclo. B puede solicitar la renovación de un contrato pendiente de firmas porque el estado se comprueba después de esos bloqueos; no necesita que la renovación sea válida para crear el ciclo. PostgreSQL abortará una transacción y el manejador general lo convierte en 500. La vinculación de invitados de varios contratos amplía las combinaciones de bloqueo.

**Corrección propuesta:** fijar un orden global de bloqueos de usuario, contrato y firmantes en todos los consumidores, y limitar la vinculación al recurso cuando corresponda. Tratar deadlocks transitorios con reintentos acotados solo si toda la operación es segura de repetir, incluidos archivos y efectos externos.

**Pruebas faltantes:** concurrencia con barreras explícitas en los puntos de bloqueo, sin sleeps ni acceso a BD compartida durante esta tarea. Cubrir sign frente a requestRenewal y acciones contractuales frente a vinculación perezosa.

#### H09 — La cola de mutaciones de archivos no tiene capacidad ni cancelación

**Evidencia:** api/src/lib/storage.ts:11 y :36–41 encadena toda operación sobre mutationTail sin cota; api/src/modules/contracts/signatures.ts:47–67 y api/src/modules/me/avatar.ts:26–35 reciben y sanean la imagen antes de entrar en esa cola; api/src/lib/storage-s3.ts:107–132 permite varios intentos lentos.

**Escenario:** un proveedor lento mantiene una única mutación activa mientras las peticiones siguientes conservan sus buffers PNG ya saneados y closures en memoria. Varias cuentas/IP pueden añadir trabajo más rápido de lo que S3 lo completa; desconectar el HTTP no retira la operación pendiente. El límite de peticiones por minuto no acota la cola acumulada ni el tamaño agregado. El problema también retrasa firmas de otros contratos detrás de avatares.

**Corrección propuesta:** cola con capacidad y admisión antes de recibir/procesar grandes buffers, rechazo 503 con reintento y descarte de peticiones abortadas antes de mutar. Mantener las reservas necesarias para pool/migración y medir la posibilidad de concurrencia segura por contrato. No sustituir la cola por concurrencia ilimitada.

**Pruebas faltantes:** driver pausado, llenar capacidad, comprobar rechazo y liberación de memoria/trabajo al abortar, sin ejecutar la operación cancelada.

#### H10 — Lecturas y exportaciones costosas carecen de cotas suficientes

**Evidencia:** api/src/modules/contracts/routes.ts:125–137 decora cada contrato con tres consultas adicionales (service.ts:292–305); :419–480 carga todas las aprobaciones y, por cada una, contrato, solicitante, todas sus versiones, revisión previa y decoración. api/src/modules/renewals/queries.ts:24–53 no pagina elegibles. api/src/modules/reports/overview-periods.ts:36–44 no limita años y :74–92 materializa todos los períodos; overview-queries.ts:27–30 agrupa todos los firmantes para activaciones, repetidamente. api/src/modules/reports/export.ts:57–86 genera el archivo completo en memoria. api/src/modules/verify/service.ts:93 busca signed_pdf_sha256, sin índice en schema.ts:233–248 ni en las migraciones 0000–0010.

**Escenarios:** una página de 100 contratos hace hasta 302 consultas; /approvals puede cargar versiones completas para un historial entero, sin paginación ni límite de respuesta. Un gestor puede solicitar un overview semanal de miles de años admitidos por las fechas ISO, materializar cientos de miles de puntos y exportarlos a PDF/XLSX. Un PDF público sin coincidencia obliga a buscar su hash en toda la tabla de contratos. Los filtros por gestor se aplican a los resultados, pero varias agregaciones de activaciones siguen recorriendo datos institucionales. No se midió el coste ni se afirma que una consulta concreta ignore un índice existente.

**Corrección propuesta:** DTO y consultas por lotes con joins/agregados; paginar aprobaciones/elegibles; cota de rango y de celdas/filas exportables, presupuesto de concurrencia y timeout de consulta. Para volúmenes grandes, exportación asíncrona con streaming donde el formato lo admita. Añadir índice parcial para signed_pdf_sha256 no nulo. Evaluar con EXPLAIN en un entorno aislado índices temporales/combinados de contracts(created_by, created_at), approvals(contract_id, reviewed_at) y eventos de cancelación; restringir la CTE de activaciones a contratos elegibles. Son propuestas, no índices añadidos sin medir.

**Pruebas faltantes:** presupuesto de número de consultas, rechazo temprano de rango/extensión excesivos, tamaño máximo de exportación y análisis de plan con volumen sintético. Las pruebas pequeñas de T12a verifican contenido y aislamiento, no estos límites.

#### H11 — Importes exactos se convierten a coma flotante en reportes y exportaciones

**Evidencia:** api/src/modules/reports/overview-queries.ts:51–52 y :92; api/src/modules/reports/overview-tables.ts:19 y :49; api/src/modules/dashboard/rich-queries.ts:22 y :79; api/src/modules/reports/export.ts:118–119.

**Escenario:** la BD suma numeric correctamente, pero ::float8/Number transforma la suma en un valor binario aproximado antes de enviarlo o exportarlo. Por ejemplo, cien contratos cercanos al máximo permitido producen un total cercano a 100 billones de DOP (10^14 DOP): ya no se garantiza conservar cada centavo en el número resultante. El fallo afecta representación y posteriores operaciones del consumidor; no se afirma que el saldo persistido se calcule con float. El contrato numérico pedido en T12a entra en conflicto con PRINCIPIOS §7.

**Corrección propuesta:** serializar importes como strings decimales, incluidos totales y series, manteniendo numeric en SQL y cálculo decimal exacto hasta formatear. Coordinar tipos HTTP y frontend; definir una política explícita de redondeo para promedios. En XLSX evitar convertir sumas fuera de la precisión soportada a números; exportarlas como texto exacto cuando sea necesario.

**Pruebas faltantes:** sumas cercanas al máximo con centavos y exportación/relectura exacta en CSV/XLSX; distinguir tasas/conteos, que sí pueden tener contrato numérico, de dinero.

#### H12 — Los reportes antiguos y daysToExpiry no aplican uniformemente la zona de Santo Domingo

**Evidencia:** api/src/modules/reports/service.ts:18–27 usa date AT TIME ZONE sin convertir antes a timestamp; contrasta con api/src/modules/reports/overview-queries.ts:21–23, que sí lo hace explícito. api/src/modules/contracts/service.ts:314–319 usa el día UTC obtenido por toISOString para daysToExpiry.

**Escenario:** con sesión PostgreSQL en UTC, el límite de fecha de reportes antiguos depende de la conversión implícita a una sobrecarga de timezone y no representa inequívocamente medianoche local. Puede incluir eventos del día anterior y excluir los de las últimas horas del día solicitado, mientras el overview usa el límite local explícito. Además, a las 21:00 en Santo Domingo ya es el día siguiente en UTC: el detalle reduce daysToExpiry un día antes que las consultas de renovaciones, que usan santoDomingoToday.

**Corrección propuesta:** compartir límites inclusivo/exclusivo basados en date::timestamp AT TIME ZONE 'America/Santo_Domingo' para todos los reportes y usar el mismo día local para plazos del detalle. Inyectar el reloj donde se calcula en TypeScript. La diferencia se deduce de los tipos/operadores y está contrastada con las [reglas de fecha y zona de PostgreSQL 17](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT); no se ejecutó SQL para reproducirla.

**Pruebas faltantes:** eventos inmediatamente antes/después de medianoche local en los tres reportes antiguos, con TimeZone de sesión UTC y otro distinto; daysToExpiry entre 20:00 y 23:59 locales y cambio de mes/año.

#### H13 — La vigencia del certificado solo se comprueba al arrancar

**Evidencia:** api/src/lib/crypto/system-signing.ts:35 retorna si ya hay signingMaterial; :62–67 comprueba vigencia una sola vez; :77–88 firma con ese material almacenado. verifySystemSeal (:92–114) comprueba confianza y firma, pero no relaciona activatedAt con el intervalo de vigencia del certificado.

**Escenario:** el proceso arranca con un certificado válido y continúa funcionando tras validTo. Sigue creando sellos nuevos y la comprobación pública puede considerarlos válidos porque el certificado sigue en el conjunto confiable. Reiniciar en esa misma fecha sí impediría arrancar, de modo que el resultado depende de cuánto tiempo lleve vivo el proceso. Los sellos históricos creados durante vigencia deben seguir verificándose; no se propone invalidarlos por haber pasado el tiempo.

**Corrección propuesta:** comprobar la vigencia al crear cada sello, con reloj inyectable y error operativo claro antes de publicar el PDF. Al verificar, contrastar la fecha de activación firmada con la vigencia del certificado correspondiente y conservar certificados históricos explícitamente confiables. Alertar de renovación con antelación.

**Pruebas faltantes:** material cargado antes de caducar, avance de reloj y firma nueva rechazada; sello histórico correcto sigue válido después de expirar el certificado; fecha firmada fuera de vigencia rechazada.

#### H14 — La validación DNS de S3 no fija la dirección que recibe las peticiones firmadas

**Evidencia:** api/src/lib/storage-endpoint.ts:48–61 resuelve y valida; api/src/lib/storage-s3.ts:106–116 vuelve a conectar por hostname mediante fetch, sin enlazar la resolución validada a la conexión. El timeout de cada intento no elimina esa diferencia.

**Escenario condicionado:** un administrador configura un endpoint HTTPS bajo control de un atacante. La primera resolución devuelve una IP pública y la usada por fetch una interna; si el servicio interno puede aceptar HTTPS para ese nombre, se elude la intención de bloquear redes privadas. Una resolución distinta entre reintentos tampoco se vuelve a validar dentro del bucle. Requiere control DNS y las condiciones de conectividad/TLS: no es un SSRF confirmado contra un servicio real ni una revelación de la secretAccessKey, que no se transmite en claro en SigV4.

**Corrección propuesta:** conectar exclusivamente a una dirección pública validada conservando hostname para SNI/Host/firma, y validar de nuevo cada conexión/resolución; o limitar destinos a proveedores institucionales aprobados y aplicar un control de salida que bloquee redes internas. Documentar el control efectivo, no solo el chequeo previo.

**Pruebas faltantes:** resolver de respuestas alternantes con conexión observada, no solo el resolver falso de validación. **Riesgo ya reconocido en T10, pendiente de cierre**; los tests actuales prueban rechazo de DNS privado/literales, no esa ventana.

#### H15 — Las credenciales S3 cifradas en BD contradicen la política de secretos vigente

**Evidencia:** api/src/lib/storage-config.ts:53–60 incluye secretAccessKey en StorageState; :72–82 cifra JSON.stringify(state); :113–118 persiste ese sobre en settings. docs/HANDOFF.md:28 y :54–55 mantiene la excepción como pregunta abierta.

**Escenario:** una copia de la BD contiene credenciales recuperables de proveedores activos, pendientes y retirados. El cifrado autenticado y la clave externa protegen frente a una lectura aislada de la BD; **no se encontró un secreto S3 en claro ni una fuga HTTP**. Sin embargo, el modelo incumple literalmente PRINCIPIOS §5 («nunca ... en la BD») y no consta en los documentos leídos una excepción aprobada. La pérdida de la clave externa impide recuperar también las firmas derivadas de ella.

**Corrección propuesta:** conservar en settings referencias a secretos gestionados fuera de la BD y resolverlas en ejecución; diseñar la conservación/rotación de proveedores retirados. Si el dueño ya autoriza el sobre cifrado como excepción, Claude debe registrar explícitamente esa decisión y su alcance en la política antes de dar el hallazgo por resuelto. Esta auditoría no solicita ni presume esa aprobación y no modifica configuración.

**Comprobación pendiente:** revisar el modelo final de secretos y una recuperación aislada. Los tests de T11 prueban ausencia de texto claro; eso no equivale a cumplir la prohibición de almacenamiento recuperable en BD.

### Bajo

#### H16 — Zod no es estricto de forma uniforme y algunas entradas carecen de esquema completo

**Evidencia:** api/src/modules/auth/schemas.ts:3–12; api/src/modules/users/schemas.ts:11–26; api/src/modules/me/routes.ts:29–32 y :50–53; api/src/modules/contracts/schemas.ts:114–117; api/src/modules/contracts/routes.ts:143 y :421; api/src/modules/notifications/events.ts:76. PDF valida solo query.final en api/src/modules/contracts/pdf.ts:138–140; múltiples rutas sin entrada esperada ignoran query/body adicionales.

**Escenario:** un typo o un atributo desconocido se descarta y la petición puede responder éxito sin aplicar lo solicitado. En registro se descarta role intencionadamente, lo cual evita la escalada pero incumple el requisito de entrada estricta de T14; no se reporta como asignación masiva de privilegios. pageSize sí tiene máximo 100, pero page, búsquedas y algunas colecciones no tienen una cota práctica uniforme.

**Corrección propuesta:** definir objetos estrictos por body/query/params, también objetos vacíos cuando corresponda, y límites de longitud/cardinalidad razonables. La transición de registro de descarte a rechazo requiere ajustar su contrato/test expresamente, sin cambiar la imposición de role=user. Mantener validación específica multipart además de Zod.

**Pruebas faltantes:** campos desconocidos en cada familia de ruta, tipos repetidos de query, params completos y límites. api/test/auth-utils.test.ts describe actualmente el descarte de atributos; no asumir que cubre estrictez.

#### H17 — La búsqueda de plantillas interpreta comodines aportados por el usuario

**Evidencia:** api/src/modules/contracts/catalog.ts:95–99 y :113 construye el patrón con '%' + query.q + '%' sin escapar; las búsquedas de contratos (routes.ts:96) y usuarios (users/service.ts:22) sí escapan barra, porcentaje y guion bajo.

**Escenario:** buscar un porcentaje o guion bajo literal devuelve todas las plantillas o coincidencias de cualquier carácter. Se amplía el trabajo y el resultado difiere de las demás búsquedas. La consulta está parametrizada: **no es inyección SQL ni permite a un gestor leer plantillas inactivas**.

**Corrección propuesta:** utilidad común de escape ILIKE para barra inversa, % y _, límite de longitud y búsqueda literal consistente.

**Pruebas faltantes:** q con %, _, barra inversa y combinaciones, conservando el alcance por rol.

### Mejora

#### H18 — Persisten rutas con SQL, funciones extensas y duplicación que dificultan revisar permisos

**Evidencia:** api/src/modules/contracts/routes.ts:39–485 reúne listados, edición, acciones, borrado y aprobación, con SQL y reglas de negocio; actions.ts:246–367 tiene un handler de override de más de 100 líneas; service.ts tiene 322 líneas; db/schema.ts, 566. api/src/modules/dashboard/rich-queries.ts:5–95 incrusta consultas densas en líneas extensas; api/src/lib/render-template.ts:12 y api/src/lib/mail/templates/layout.ts:1 duplican escapeHtml. El borrado y otras decisiones siguen separados entre can.* y handlers.

**Escenario:** añadir una acción obliga a revisar guardas, SQL y auditoría en distintos sitios; H01, H02 y H05 muestran divergencias concretas que esa estructura facilita. Los tamaños son orientativos en CODE_STANDARDS, no fallos de seguridad por sí solos. No se encontraron tipos any explícitos, @ts-ignore, TODO sin dueño ni SQL crudo controlado directamente por entrada en el código operativo revisado.

**Corrección propuesta:** separar rutas/servicios/consultas/permisos por responsabilidad; compartir reglas de alcance, borrado y aprobación y un escape común. Extraer bloques de override con nombres de negocio y hacer legibles las consultas. Mantener el comportamiento protegido por pruebas de reglas, evitando tests que solo repliquen implementación.

**Pruebas pendientes:** las regresiones propuestas en H01–H17 son la cobertura útil. No se propone escribir tests de formato ni ejecutar cambios de estructura durante esta auditoría.

## Controles contrastados y riesgos ya tratados

- **Auth:** JWT HS256 con issuer/audience y 15 minutos; sid estable por familia y versión de credenciales. authenticate consulta sesión y usuario vigentes en cada petición; cambio de rol, inactividad, borrado y correo sin confirmar impiden acceso. Refresh rota bajo bloqueo, mantiene familia, trata carrera con 409 y revoca globalmente por reuso fuera de gracia. Logout por cookie revoca la familia, logout-all y reset revocan todas. El cambio de contraseña conserva la familia actual con JWT nuevo e invalida recuperaciones previas. No se reproduce el fallo antiguo de revocación T07-H02.
- **Cookies/origen/proxy:** httpOnly, SameSite=Lax, Secure en producción y path /api/v1/auth; CORS restringido al origen APP_URL; rechazo de Origin distinto en mutaciones. Origin ausente se admite, sin bypass de navegador demostrado. TRUST_PROXY por defecto false, con soporte explícito de saltos/IP/CIDR; true confía en cualquier proxy y requiere aislamiento/normalización de cabeceras por infraestructura. No se leyó su valor real ni se afirma una mala configuración desplegada.
- **Identidad:** invitaciones solo por correo confirmado normalizado, sin concesión de acceso por cédula editable; índice único parcial para usuario por contrato y cuarentena de vínculos antiguos. Permisos de lectura permiten A/S sobre todos, G creador y cualquier rol como firmante vinculado. Los filtros de contratos/reportes/dashboard de gestor se aplican en servidor. lookup por cédula es una búsqueda staff, no autenticación.
- **Firma final:** bloqueo FOR UPDATE del contrato serializa firmas/acciones y la comprobación de turno. Un duplicado firmado produce 409 antes de insertar otra evidencia. La unicidad firmante/versión y secuencia protege duplicados. La última firma registra evidencia y auditoría y genera el PDF/sello dentro de la transacción; los archivos escritos por esa operación se retiran tras rollback. El final existente se lee, no se regenera; los drivers impiden sobrescritura. No se confirmó doble PDF final por concurrencia. La pérdida de respuesta de una firma completada devuelve conflicto al reintentar, sin duplicación; no devuelve necesariamente la misma respuesta exitosa.
- **Evidencia/conservación:** T10 encadena auditoría y evidencia, conserva imágenes/versiones anteriores y mantiene everSigned; FK de evidencia restringe borrado. Cancelar un contrato con PDF fija revokedAt y restaurarlo no limpia esa marca. El verificador público comprueba cadenas, hash de bytes y sello anclado; usa iniciales y no devuelve cédula, email, IP, sesión, user-agent ni razón de cancelación. El título es texto del contrato y puede contener datos aportados por su autor: su uso público merece política de contenido, no se certifica que sea anónimo por validación. Las imágenes de firmas solo se descargan con autorización contractual. H01 se refiere específicamente a contratos aprobados sin firma.
- **Almacenamiento:** claves lógicas restringidas, comprobación de ancestros/symlinks y publicación exclusiva local; PNG se decodifica con dimensiones/salida acotadas. AES-GCM con AAD y HKDF protege firmas; lectura plana fuera de test solo bajo ventana explícita de backfill. S3 exige HTTPS salvo localhost fuera de producción, no sigue redirects y sanea errores. Resolución privada/literal se rechaza, con límite H14. No se confirmó traversal ni SQL injection. Los usos de sql.raw operativos son SQL fijo o asc/desc seleccionado de enum; seeds usan SQL estático.
- **Migración de storage:** locks 10411/10409 coordinan mutaciones, migración y backup; checkpoints revalidan contenido, tamaño y SHA, incluidos objetos ya copiados. La activación cambia proveedor solo tras verificar todo; el origen se conserva. El fallo controlado libera migrating y conserva pending. Un corte de proceso puede dejar migrating=true y exigir reanudar o reconfigurar; no hay reanudación automática. El inventario incluye referencias históricas de signature_evidence. El backfill cifra lo que enumera el proveedor: no certifica por sí solo que no falten archivos referenciados.
- **Reportes/paneles:** overview fija gestor a actor.id aunque reciba otro managerId; la sección users y el reporte de usuarios exigen admin; exportaciones usan el mismo resultado autorizado. El overview usa repeatable read/read only y fechas locales explícitas. CSV neutraliza fórmulas y XLSX no acepta objetos de fórmula externos. No se confirmó fuga de filas de otros gestores en esas exportaciones. Los agregados institucionales expresamente existentes (por ejemplo institutionFirstTimeApprovalRate en gestor-queries.ts:49) y el catálogo de filtros no conceden lectura del documento ajeno; si se exige aislamiento absoluto también de agregados, Claude debe explicitarlo y ajustar ese contrato.
- **Jobs:** advisory locks por nombre, liberados en la misma conexión; outbox usa FOR UPDATE SKIP LOCKED y ledger de vencimientos evita avisos duplicados. El lock no convierte SMTP en entrega exactamente una vez: una entrega externa seguida de rollback puede repetirse, como ya reconoce T07. Las plantillas escapan saludo, mensaje y enlaces; no se confirmó inyección HTML. Los tokens de correo quedan cifrados y se eliminan al entregar, fallar definitivamente o expirar. El job no revalida si el objeto/cuenta cambió desde el encolado de un aviso ordinario: es un límite de entrega a considerar en su política, no una fuga cruzada demostrada aquí.
- **SSE:** ticket aleatorio con hash, 30 s, un uso, ligado a sid/rol/versión; la suscripción revalida al abrir y cierra por revocación local, heartbeat o máximo de una hora. Tickets, bus y límites están en memoria por proceso. Con réplicas, el ticket puede llegar a otra instancia y las revocaciones remotas tardar hasta el siguiente heartbeat (25 s, cierre de validación bloqueada en el siguiente); no equivale a revocación global instantánea. Requiere afinidad/bus compartido si se despliega con varias instancias. No se confirmó ese despliegue ni se presenta como nueva corrección respecto de T09a.
- **Custodia/operación:** sello detached permitido en T10, sin PAdES incrustado, TSA ni acreditación INDOTEL; no se detectó afirmación de firma cualificada en el API. La lectura completa y viewedAt siguen siendo una declaración del cliente, no una prueba independiente de lectura humana. Los informes T10/T11 ya advierten que el backup local no captura S3 y que falta restauración real conjunta; queda pendiente validar recuperación cifrada externa antes de producción. No se ejecutó ni revisó una infraestructura real en esta tarea.
- **SMTP:** se descartó una sospecha sobre createTransport({ url, ... }): la forma está admitida por la [documentación oficial de Nodemailer](https://nodemailer.com/smtp). Los tests locales usan un transporte simulado; esta revisión no acredita una entrega real.

## Matriz completa de autorización por endpoint

Todas las rutas llevan /api/v1. Se enumeran **102 combinaciones explícitas método/ruta**, incluidos bucles de registro. Cada GET tiene también HEAD implícito con el mismo control; OPTIONS de CORS no expone un handler de negocio. /users y /users/ se normalizan por configuración.

A=admin, S=supervisor, G=gestor, U=user. authenticate exige usuario activo, correo confirmado, rol vigente, familia de sesión activa y versión de credenciales. mustChangePassword solo permite PATCH /me/password y POST /auth/logout en las rutas autenticadas. No hay una dispensa de firma para el admin.

**Lectura C:** A/S cualquiera, G responsable (createdBy), o firmante vinculado de cualquier rol. **Gestión C:** A/S cualquiera o G responsable. Son los permisos efectivos de HEAD; H02 marca la discrepancia con la prohibición de autoaprobación. Las referencias abreviadas son relativas a api/src/modules/, excepto app.ts, relativo a api/src/. Los servicios de cada módulo se contrastaron, no se infirió alcance por el preHandler únicamente.

| Método | Ruta | Control de entrada | Alcance real y observaciones | Evidencia |
| --- | --- | --- | --- | --- |
| GET | /health | Público | Solo disponibilidad y select 1. | app.ts:76 |
| POST | /auth/register | Público | Registro opaco 202; rol user impuesto; presupuestos por IP. | auth/routes.ts:26 |
| POST | /auth/login | Público + contraseña | Cuenta activa y confirmada; crea familia; límites IP y combinación IP+email. H07. | auth/routes.ts:35 |
| POST | /auth/refresh | Cookie refresh | Token/familia vigentes; rotación y detección de reuso. | auth/routes.ts:62 |
| POST | /auth/logout | Cookie opcional | Revoca solo la familia identificada por esa cookie; idempotente. | auth/routes.ts:74 |
| POST | /auth/logout-all | authenticate | Solo todas las sesiones del propio usuario. | auth/routes.ts:79 |
| POST | /auth/confirm-email | Token de un uso | Propósito, destino y vigencia; revoca sesiones. | auth/routes.ts:84 |
| POST | /auth/resend-confirmation | Público | Respuesta opaca; presupuesto IP; sin presupuesto por destinatario H07. | auth/routes.ts:88 |
| POST | /auth/forgot-password | Público | Respuesta opaca; presupuesto IP; sin presupuesto por cuenta H07. | auth/routes.ts:100 |
| POST | /auth/reset-password | Token de un uso | Propósito, vigencia y consumo bajo lock; invalida recuperaciones/sesiones. | auth/routes.ts:112 |
| GET | /me | authenticate | Propio, proyección publicUser. | me/routes.ts:10 |
| PATCH | /me | authenticate | Solo nombre/teléfono/cédula propios; no modifica rol. | me/routes.ts:11 |
| PATCH | /me/password | authenticate + contraseña actual | Propia; cambia versión, conserva familia actual y emite JWT nuevo. | me/routes.ts:24 |
| PATCH | /me/email | authenticate + contraseña actual | Email pendiente propio y confirmación posterior; H07. | me/routes.ts:45 |
| PUT | /me/avatar | authenticate | Propio; PNG saneado y multipart limitado. | me/routes.ts:61 |
| DELETE | /me/avatar | authenticate | Propio; referencia de usuario y archivo. | me/routes.ts:64 |
| GET | /files/avatars/:name | Público | Nombre UUID y fila kind=avatar; diseño de URL pública no enumerada secuencialmente. | me/routes.ts:68 |
| GET | /signature-declaration | Público | Texto/versión estáticos de declaración. | contracts/signature-style.ts:79 |
| GET | /me/signature-style | authenticate | Solo preferencia propia; 404 si no hay. | contracts/signature-style.ts:80 |
| PUT | /me/signature-style | authenticate | Solo texto/fuente propios; audita sin texto. | contracts/signature-style.ts:81 |
| DELETE | /me/signature-style | authenticate | Olvida preferencia propia; idempotente y auditado. | contracts/signature-style.ts:81 |
| GET | /users/lookup | requireRole(A,S,G) | Búsqueda exacta de cédula activa/no borrada; cinco campos de contacto, no concede acceso. | users/routes.ts:15 |
| GET | /users | requireRole(A) | Lista paginada de no borrados; publicUser incluye datos personales H04. | users/routes.ts:40 |
| GET | /users/:id | requireRole(A) | Usuario no borrado; proyección sin hashes/tokens. | users/routes.ts:43 |
| POST | /users | requireRole(A) | Crea rol validado; contraseña o invitación; auditoría solo logger H03. | users/routes.ts:46 |
| PATCH | /users/:id | requireRole(A) | Revalida admin bajo lock; impide autoexpulsión y pérdida del último admin; H03. | users/routes.ts:58 |
| DELETE | /users/:id | requireRole(A) | Borrado lógico y revocación; mismas guardas de administración; H03. | users/routes.ts:73 |
| GET | /variables | requireRole(A,S,G) | A/S todas; G solo variables de plantillas activas. | contracts/catalog.ts:32 |
| POST | /variables | requireRole(A,S) | Definición validada; select exige opciones; sin auditoría H03. | contracts/catalog.ts:38 |
| PATCH | /variables/:id | requireRole(A,S) | Lock de catálogo y variable; renombrado restringido por uso en plantillas; H03. | contracts/catalog.ts:45 |
| DELETE | /variables/:id | requireRole(A,S) | Lock y protección de usos actuales/históricos; H03. | contracts/catalog.ts:77 |
| GET | /templates | requireRole(A,S,G) | G solo activas; usageCount institucional. Búsqueda con comodines H17. | contracts/catalog.ts:93 |
| POST | /templates/preview | requireRole(A,S,G) | G solo definiciones disponibles en activas; render como texto escapado. | contracts/catalog.ts:125 |
| GET | /templates/:id | requireRole(A,S,G) | G solo activa, 404 para inactiva/inexistente. | contracts/catalog.ts:142 |
| POST | /templates | requireRole(A,S) | Lock, resolución de variables y creador de sesión; H03. | contracts/catalog.ts:150 |
| PATCH | /templates/:id | requireRole(A,S) | Lock, esquema parcial y recálculo de variables; H03. | contracts/catalog.ts:164 |
| PATCH | /templates/:id/status | requireRole(A,S) | Mismo handler, enum estricto; H03. | contracts/catalog.ts:164 |
| POST | /templates/:id/duplicate | requireRole(A,S) | Copia como inactive; H03. | contracts/catalog.ts:164 |
| DELETE | /templates/:id | requireRole(A,S) | Impide borrar con contratos vinculados; H03. | contracts/catalog.ts:164 |
| GET | /contracts | requireRole(A,S,G) | A/S todos, G propios; filtros no amplían alcance; DTO excesivo H04/N+1 H10. | contracts/routes.ts:92 |
| GET | /contracts/counts | requireRole(A,S,G) | G por createdBy propio; todos los estados y flag archived. | contracts/routes.ts:141 |
| POST | /contracts | requireRole(A,G) | G plantilla activa; creador es el actor; snapshot y auditoría transaccionales. | contracts/routes.ts:163 |
| GET | /contracts/:id | authenticate | Lectura C, vinculación por correo confirmado; ajenos 404; datos de firmantes H04. | contracts/routes.ts:201 |
| PATCH | /contracts/:id | requireRole(A,G) | A o G responsable, draft/rejected sin final; nueva versión; ajeno 403 H05. | contracts/routes.ts:202 |
| DELETE | /contracts/:id | authenticate | A o G responsable, draft/rejected sin firmas/final/evidencia; omite aprobación histórica H01. | contracts/routes.ts:341 |
| POST | /contracts/:id/submit | authenticate + lectura C | A o G responsable; draft/rejected. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/approve | authenticate + lectura C | A o S que no sea responsable; pending_approval con solicitud pendiente. H02. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/reject | authenticate + lectura C | Mismo revisor; comentario obligatorio; pending_approval. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/cancel | authenticate + lectura C | Gestión C; pending_signatures/active/expiring_soon; categoría y descripción. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/uncancel | authenticate + lectura C | Solo A; restaura estado cancelable previo; revokedAt permanece. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/archive | authenticate + lectura C | Gestión C; cambia flag; repetir produce 409. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/unarchive | authenticate + lectura C | Gestión C; cambia flag; repetir produce 409. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/override-status | authenticate + lectura C | Solo A; motivo y transición permitida, auditoría excepcional; puede activar sin firmas. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/remind | authenticate + lectura C | Gestión C; firmante pendiente en turno; máximo persistente 1/h. | contracts/routes.ts:298 → actions.ts |
| POST | /contracts/:id/decline | authenticate + lectura C | Firmante propio pendiente; pending_signatures; motivo. No exige turno para declinar. | contracts/routes.ts:298 → actions.ts |
| GET | /contracts/:id/versions | authenticate | Lectura C antes de consultar; snapshots completos, sin paginación H04/H10. | contracts/routes.ts:374 |
| GET | /contracts/:id/versions/:n | authenticate | Lectura C; UUID y número positivo, filtro contrato+versión. | contracts/routes.ts:405 |
| GET | /contracts/:id/audit | authenticate | Lectura C; filtro por contrato, pagina; IP/origen sin DTO H04. | contracts/routes.ts:374 |
| GET | /contracts/:id/approvals | authenticate | Lectura C; solo aprobaciones del contrato, sin paginación. | contracts/routes.ts:374 |
| GET | /approvals | requireRole(A,S) | Lista institucional de aprobaciones; decidir propias S sigue vedado; sin cota/N+1 H10. | contracts/routes.ts:419 |
| GET | /me/signatures | authenticate | Solo userId propio; vínculo por correo, resumen y página/estado. | contracts/signatures.ts:28 |
| POST | /contracts/:id/sign | authenticate | Firmante propio, pending_signatures y turno; declaración/frescura/lock; ajeno 403 H05. | contracts/signatures.ts:35 |
| GET | /files/signatures/:id | authenticate | A/S, creador actual o firmante del contrato; kind=signature; ajenos 404. | contracts/signatures.ts:175 |
| GET | /contracts/:id/pdf | authenticate | Lectura C; final persistido y hash verificado; query final validada manualmente. | contracts/pdf.ts:133 |
| POST | /contracts/:id/reassign | requireRole(A) | Destino activo G/A; no archived/cancelled/renewed; motivo; lock, auditoría, avisos. | contracts/admin-routes.ts:36 |
| POST | /contracts/bulk | requireRole(A) | 1–100 IDs únicos; cancel/archive/unarchive con reglas individuales y transacción por ID; 10/min. | contracts/admin-routes.ts:41 |
| GET | /renewals/eligible | authenticate | A/S, creador o firmante; estado renovable y sin renovación en curso; sin paginación H10. | renewals/routes.ts:13 |
| GET | /renewals | authenticate | A/S; G creador del original; cualquier solicitante propio. Pagina y filtra; requester.email H04. | renewals/routes.ts:16 |
| POST | /renewals | authenticate | Lectura C del original, estado/fechas y ausencia de renovación en curso; lock. | renewals/routes.ts:20 |
| POST | /renewals/:id/approve | authenticate | A/S o creador del original; solicitud pendiente; falta separación del solicitante H02; 403 ajeno H05. | renewals/routes.ts:25 |
| POST | /renewals/:id/reject | authenticate | Mismo procesador, respuesta obligatoria y pending; 403 ajeno H05. | renewals/routes.ts:25 |
| POST | /renewals/:id/cancel | authenticate | Solo requestedBy propio y pending; 403 ajeno H05. | renewals/routes.ts:25 |
| GET | /notifications/unread-count | authenticate | Cuenta solo userId propio. | notifications/routes.ts:24 |
| GET | /notifications | authenticate | Filtra userId propio, estado leído y página. | notifications/routes.ts:27 |
| POST | /notifications/read-all | authenticate | Actualiza solo userId propio. | notifications/routes.ts:34 |
| POST | /notifications/:id/read | authenticate | Combina id + userId; ajena/inexistente 404. | notifications/routes.ts:37 |
| DELETE | /notifications/:id | authenticate | Combina id + userId; ajena/inexistente 404. | notifications/routes.ts:37 |
| GET | /me/notification-preferences | authenticate | Solo preferencias propias. | notifications/routes.ts:45 |
| PATCH | /me/notification-preferences | authenticate | Patch estricto de tres flags; userId propio. | notifications/routes.ts:48 |
| POST | /events/ticket | authenticate | Ticket ligado a usuario, rol, sesión y versión; 30 s. | notifications/events.ts:63 |
| GET | /events | Ticket de un uso | Sin bearer en esta ruta; canje exige sesión vigente y solo suscribe su userId. | notifications/events.ts:75 |
| GET | /dashboard | authenticate | Handler por rol de BD: G creador propio, U solo firmante propio; A/S institucional. | dashboard/routes.ts:10 |
| GET | /reports/filters | requireRole(A,S,G) | G solo su identidad en managers; catálogo de plantillas, sin email/cédula. | reports/routes.ts:16 |
| GET | /reports/overview | requireRole(A,S,G) | G forzado a actor.id; users exclusivamente A; H10–H11. | reports/routes.ts:17 |
| GET | /reports/overview/export | requireRole(A,S,G) | Mismo resultado/alcance del overview; csv/xlsx/pdf; H10–H11. | reports/routes.ts:20 |
| GET | /reports/contracts | requireRole(A,S,G) | A/S todos; G solo contratos propios, incluso con managerId ajeno; exportación comparte servicio. H11/H12. | reports/routes.ts:44 |
| GET | /reports/contracts/export | requireRole(A,S,G) | A/S todos; G solo contratos propios, incluso con managerId ajeno; exportación comparte servicio. H11/H12. | reports/routes.ts:50 |
| GET | /reports/users | requireRole(A,S,G) + servicio exige A | Solo A; datos agregados; exportación comparte servicio. | reports/routes.ts:44 |
| GET | /reports/users/export | requireRole(A,S,G) + servicio exige A | Solo A; datos agregados; exportación comparte servicio. | reports/routes.ts:50 |
| GET | /reports/approvals | requireRole(A,S,G) | A/S todos; G solo contratos propios, incluso con managerId ajeno; exportación comparte servicio. H11/H12. | reports/routes.ts:44 |
| GET | /reports/approvals/export | requireRole(A,S,G) | A/S todos; G solo contratos propios, incluso con managerId ajeno; exportación comparte servicio. H11/H12. | reports/routes.ts:50 |
| GET | /system/storage | requireRole(A) | Solo vista saneada, hasSecret y últimos cuatro del identificador; sin claves. | system/routes.ts:16 |
| PUT | /system/storage | requireRole(A) + 10/min por actor | Prueba destino; cambio de identidad exige secreto; estado cifrado y auditado. | system/routes.ts:24 |
| POST | /system/storage/test | requireRole(A) + 10/min por actor | Prueba controlada de proveedor; no guarda configuración; SSRF condicionado H14. | system/routes.ts:31 |
| POST | /system/storage/migrate | requireRole(A) | Solo destino pendiente; lock de configuración, checkpoint, 202 con jobId. | system/routes.ts:34 |
| GET | /system/settings | requireRole(A) | Solo claves institucionales permitidas; excluye storage/secretos. | system/routes.ts:43 |
| PATCH | /system/settings | requireRole(A) | Esquema parcial estricto; falta auditoría H03; logo se procesa antes de auth H06. | system/routes.ts:44 |
| POST | /system/mail/test | requireRole(A) | Destinatario aportado y validado; encola 202; H03. | system/routes.ts:51 |
| GET | /system/jobs | requireRole(A) | Última ejecución por job y resumen saneado/outbox. | system/routes.ts:55 |
| POST | /system/jobs/:name/run | requireRole(A) | Enum cerrado; advisory lock por job; sin identidad persistente manual H03. | system/routes.ts:58 |
| GET | /verify/:code | Público + 10/min por IP/ruta | Código con formato cerrado; valid/revoked/invalid/not_found; datos mínimos. | verify/routes.ts:7 |
| POST | /verify/file | Público + 10/min por IP/ruta | Un PDF, MIME/cabecera y 15 MiB; no persiste; busca hash y verifica, H10. | verify/routes.ts:13 |

## Cobertura de pruebas leída y verificaciones pendientes

Los tests T09a cubren revocación de familias/versiones, rotación concurrente, SSE, opacidad del registro, presupuestos IP y cifrado de correo. Los T09b cubren identidad por correo, imágenes, snapshots y resúmenes. Los T10 cubren cadenas, alteración, PDF/hash, borrado con firmas, estilos, backfill y fallos de storage. Los T11 cubren drivers, rutas, errores de proveedor, migración y reanudación con proveedor simulado. T12a cubre filtros/aislamiento, cálculos, bandas, exportación, reasignación y lote. Esto describe **código de pruebas leído**, no resultados verificados ahora.

Faltan las regresiones concretas señaladas en cada hallazgo. Además, conviene añadir una prueba de dos últimos firmantes en el mismo turno compitiendo, reintento después de respuesta perdida y fallo de publicación/commit: debe quedar una evidencia por firmante/versión y un único PDF final. El bloqueo e índices observados lo respaldan estáticamente, pero no sustituyen esa prueba. La verificación de S3 real, permisos Linux, DNS/conexión real y restauración cifrada externa sigue fuera de lo acreditado por fixtures/simulaciones.

No se ejecutaron los checks generales de CODE_STANDARDS porque esta tarea prohíbe tests y modificaciones de código y exige solo lectura. No se declaran aprobados ni fallidos. Las propuestas siguientes deben probarse más adelante en entornos aislados y coordinados con los otros trabajos.

## Tareas propuestas para asignación de Claude

1. **Conservación y separación de aprobación — prioridad alta (H01, H02).** Marca histórica de aprobación, backfill y protección única de borrado; separar responsable mutable de autoría/solicitud; impedir autoaprobaciones ordinarias de contratos y renovaciones para todos los roles. Cubrir declinación sin firmas, edición intermedia, reasignación y cambio de rol. Confirmar la política excepcional solo donde haya operación explícita con motivo, sin bloquear la preparación de estas correcciones.
2. **Auditoría persistente y DTO de privacidad — prioridad alta/media (H03, H04, H05).** Revisar primero la entrega commiteada de T12b para absorber usuarios/auditoría sin duplicar trabajo; extender transacciones de auditoría a catálogo, ajustes y acciones manuales. Proyecciones mínimas para listas/detalle/historial y criterio uniforme 404 fuera de alcance. Actualizar contratos frontend y pruebas de ausencia de datos personales y secretos.
3. **Admisión de trabajo y concurrencia — prioridad media (H06, H07, H08, H09).** Mover saneado del logo tras autorización/límite temprano; presupuestos por cuenta/destinatario además de IP; orden global de bloqueos y cola de archivos con capacidad/cancelación. Pruebas deterministas con barreras, capacidad y clocks inyectados. Añadir la regresión de última firma concurrente y rollback sin duplicados.
4. **Consultas, exportación y exactitud — prioridad media (H10, H11, H12).** Eliminar N+1 y respuestas históricas ilimitadas; rango/celdas/concurrencia acotados, exportaciones grandes controladas e índice del hash público. Medir planes antes de proponer otros índices. Contrato decimal exacto y helper de fechas/plazos de Santo Domingo para API y exportaciones, con límites locales y sumas de gran magnitud en pruebas.
5. **Custodia criptográfica y almacenamiento — prioridad media (H13, H14, H15).** Revalidar vigencia al sellar y fecha firmada al verificar; cerrar DNS rebinding en la conexión o mediante destinos/control de salida institucional; resolver almacenamiento externo de secretos o documentar la excepción aprobada. Ensayar por separado caída/reanudación de migración y recuperación conjunta BD/storage/S3 con claves conservadas, copias cifradas externas y evidencias históricas. No dar esa recuperación por aceptada con los tests simulados actuales.
6. **Validación coherente y mantenibilidad — prioridad baja/mejora (H16, H17, H18).** Objetos Zod estrictos y cotas prácticas; escape ILIKE compartido; extraer servicios/queries de rutas y dividir funciones extensas preservando las reglas. Coordinar con T13 antes de tocar catálogo, contenido, snapshots o renderizador. Después de integrar ambos trabajos, realizar una nueva revisión del commit resultante y ejecutar los checks obligatorios por separado de esta auditoría.
