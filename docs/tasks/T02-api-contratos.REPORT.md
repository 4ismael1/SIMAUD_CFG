# T02 — API de contratos: informe de implementación

Fecha: 2026-11-09 (America/New_York).

## Estado

Implementación funcional terminada y validada: npm test aprobó 235 pruebas en 5 archivos; typecheck y build finalizaron sin errores. La auditoría online permanece bloqueada por acceso al registro npm; la auditoría offline devuelve cero vulnerabilidades. No se afirma que npm audit online haya pasado.

Se leyeron primero api/README.md y T01-api-core.REPORT.md y se consultaron las referencias de contratos del frontend y Supabase. Los cambios se limitan a api/ y este informe en docs/tasks/. No se modificó ni imprimió api/.env. No se añadieron dependencias, no se modificaron los paquetes raíz y no se hizo commit ni staging. Los cambios preexistentes fuera de este alcance se conservaron.

## Entrega y endpoints

Todas las rutas llevan /api/v1, usan el contrato de errores de T01 y comprueban los permisos en servidor.

| Área | Rutas implementadas |
| --- | --- |
| Variables | GET/POST /variables; PATCH/DELETE /variables/:id |
| Plantillas | GET/POST /templates; GET/PATCH/DELETE /templates/:id; POST /templates/:id/duplicate; PATCH /templates/:id/status; POST /templates/preview |
| Contratos | GET/POST /contracts; GET /contracts/counts; GET/PATCH/DELETE /contracts/:id |
| Transiciones | POST /contracts/:id/submit, /approve, /reject, /cancel, /uncancel, /archive, /unarchive, /override-status |
| Seguimiento | GET /contracts/:id/versions, /versions/:n, /audit, /approvals; POST /contracts/:id/remind |
| Aprobaciones | GET /approvals?status=pending, approved o rejected |
| Firmas | GET /me/signatures?status=pending o signed; POST /contracts/:id/sign; POST /contracts/:id/decline; GET /files/signatures/:id |

Implementación principal en src/modules/contracts/:
- state-machine.ts: máquina pura con transiciones ordinarias, restauración del estado anterior y validación de override.
- schemas.ts: cuerpos estrictos, fechas, campos requeridos, firmantes y filtros.
- catalog.ts: variables, referencias en plantillas, preview, duplicación y restricciones de borrado.
- service.ts: permisos, vinculación, diff de firmantes, versiones, auditoría y notificaciones.
- routes.ts: consultas, cola de aprobaciones y operaciones transaccionales.
- signatures.ts: multipart PNG, orden de firma, declaración, descarga autorizada y almacenamiento.

src/lib/render-template.ts extrae variables, escapa contenido y valores, detecta ausencias y formatea fechas en es-DO y números con RD$. Se utiliza Intl, disponible en Node; no requiere una biblioteca adicional.

Las transiciones toman FOR UPDATE sobre el contrato y escriben cambio, auditoría y notificaciones en la misma transacción. Dos aprobaciones concurrentes producen un éxito y un 409. Las firmas se serializan por contrato, conservan IP/UA, viewedAt y aceptación de la declaración; la última activa el contrato. Los correos signature_required y approval_result se envían después del commit mediante el mailer de T01.

El detalle devuelve can y signatureFileId para cada imagen actual. Los documentos, versiones, auditoría, aprobaciones y PNG respetan el acceso al contrato. Los listados filtran por creador para gestor y ofrecen paginación, filtros, metadatos de firmas y vencimiento.

## Migraciones y seed

Se conservan las 14 tablas de T01. Se añadieron:
- 0001_t02_contracts.sql: códigos únicos anuales, función generadora, previous_status, viewed_at, accepted_declaration_at y last_reminded_at.
- 0002_t02_snapshots.sql: snapshot JSONB de datos y firmantes en cada versión.
- 0003_t02_signature_files.sql: referencia del archivo al contrato, para conservar acceso al historial y eliminar archivos al borrar el documento.

Los snapshots y el journal de Drizzle están actualizados. db:generate no detecta diferencias pendientes. Las migraciones se aplicaron tanto a desarrollo como a la base de pruebas mediante el túnel existente.

El seed añade ocho contratos con UUIDs fijos: draft, pending_approval, rejected, pending_signatures, active, expiring_soon, expired y cancelled. Tienen versiones, aprobaciones cuando corresponden, auditoría y ocho firmantes vinculados al usuario seed. Se ejecutó dos veces sin duplicarlos. Los contratos firmados de ejemplo son demostrativos y no incluyen PNG ni representan firmas reales.

La plantilla nueva usa pesos dominicanos; al repetir el seed también se corrige la frase antigua de la plantilla existente sin reemplazar el resto del contenido.

## Ajustes a T01

1. Refresh rotado dentro de los últimos 15 segundos devuelve 409 REFRESH_RACE, sin revocar la familia ni escribir otra cookie. Fuera de la gracia se mantiene la revocación por reutilización. Se ajustaron las pruebas de concurrencia y de reutilización tardía.
2. TRUST_PROXY acepta false por defecto, true, número de saltos o IPs/CIDRs separados por comas. La configuración validada se aplica a Fastify; el número de saltos se implementa mediante su función de confianza porque los tipos de esta versión no admiten un número directamente. .env.example y README documentan el uso.
3. Se mantiene un único estado vigente, contracts.status. previous_status es exclusivamente el dato de restauración de una cancelación; la prueba del esquema distingue ese metadato de los antiguos estados paralelos.
4. Los errores de unicidad de nombres de variable y códigos ya no se presentan como errores de email.

## Decisiones y límites

- El contenido de plantillas se trata como texto escapado, incluido su marcado HTML. Los valores nunca se interpolan como HTML confiable. El cliente puede presentar saltos de línea con white-space: pre-wrap.
- Puesto que template_variables no tiene estado propio en T01, gestor ve las variables referenciadas por plantillas activas.
- Los firmantes de igual signingOrder comparten turno. Se avisa a todos los del menor orden pendiente.
- El diff conserva ids y vínculos por email o cédula y rechaza identificadores que apuntan a personas distintas. Editar rejected crea una versión, vuelve a draft y reinicia las firmas. El envío directo desde rejected vuelve a habilitar a quien había declinado.
- Cada PATCH de contrato crea una versión de la instantánea, incluso si solo se cambia un dato accesorio. Se preservan las versiones anteriores.
- Override exige admin, motivo y una arista válida de la máquina. Ejecuta los efectos correspondientes de aprobación/cancelación/notificación. Activar por override es una decisión administrativa explícita, registrada como override-status y diferenciada de una firma.
- Los códigos usan secuencias por año y advisory lock de PostgreSQL. No se reutilizan tras borrado y pueden presentar saltos por rollback/reintentos. La función crea la secuencia del año al necesitarla; el rol de BD debe poder crearla o debe precrearse con ese mismo nombre.
- La descarga de firmas también permite al creador, aunque cambie su rol. Las imágenes históricas conservan referencia al contrato aunque un cambio de firmantes quite su asociación actual.
- PNG se comprueba por MIME, firma binaria y cabecera IHDR; el límite es 500 KiB. No hay procesamiento gráfico ni firma criptográfica.
- El sistema de archivos no comparte transacción con PostgreSQL: un error transaccional elimina el nuevo PNG; los borrados posteriores al commit son de mejor esfuerzo. Una terminación abrupta puede requerir limpieza de archivos huérfanos.
- El correo conserva el comportamiento de T01: después del commit y sin cola durable. Su fallo no revierte el documento.
- Cron y creación de renovaciones pertenecen a T03; sus transiciones están disponibles en la máquina pura.

No hubo dependencias nuevas bloqueadas ni sustituciones de bibliotecas por implementaciones propias. No quedan decisiones de negocio que requieran respuesta para ejecutar los endpoints entregados.

## Validación

| Comprobación | Resultado |
| --- | --- |
| npm test | 235 pruebas aprobadas, 5 archivos, código de salida 0; duración 276,13 s |
| Máquina y render aislados | 194 pruebas aprobadas |
| Integración T02 aislada | 11 pruebas aprobadas contra PostgreSQL |
| npm run typecheck | Correcto, cero errores |
| npm run build | Correcto |
| npm run db:generate | Sin cambios pendientes |
| db:migrate | Correcto |
| db:seed, dos ejecuciones | Correcto; 8 contratos, 8 firmantes enlazados |
| npm audit --offline --logs-max=0 | 0 vulnerabilidades |
| npm audit online | Falla la petición al endpoint de auditoría del registro npm |

La cobertura incluye las transiciones válidas e inválidas, escape/formato, permisos por rol y pertenencia, creación con rollback por firmante inválido, orden de firma, última firma, concurrencia de aprobación, PNG privado/falso/grande, firma repetida, versiones y diff tras rechazo, cancelación y restauración, archivado, override, recordatorios persistentes, borrado confirmado, variable/plantilla en uso y vinculación al primer acceso. También se comprobaron las regresiones de defaults en actualizaciones parciales y el reenvío tras declinar.

La terminal estándar no pudo iniciarse por setup refresh had errors. Se utilizó el runtime de Node disponible para ejecutar los mismos scripts y sus ejecutables. Una ejecución inicial superó el timeout de la herramienta; se detuvieron los diagnósticos que llegaron a solaparse y la verificación definitiva se ejecutó en una sola instancia. Esos resultados transitorios no se usan como validación.

## Pendiente externo

Con acceso al registro npm, ejecutar desde api/:

```sh
npm audit
```

El fallo observado está en https://registry.npmjs.org/-/npm/v1/security/advisories/bulk. La auditoría offline no sustituye la consulta online; ese criterio de aceptación queda pendiente del entorno.
