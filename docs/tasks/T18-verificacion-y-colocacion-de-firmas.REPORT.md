# T18 — Verificación pública y colocación de firmas

Fecha: 10 de noviembre de 2026.

## Resultado y alcance

Implementadas las partes A–D en `api/`, la documentación de proxies en
`docs/DEPLOY.md` y este informe. Se leyeron CODE_STANDARDS, PRINCIPIOS y los
informes T10, T14, T15 y T16. No se hizo commit, no se modificó el frontend,
no se leyó `api/.env` ni se imprimieron secretos. Se ignoró la actualización
concurrente del informe T16.

Al cerrar también aparece un cambio ajeno en
`src/features/templates/TemplateEditorPage.tsx`; se observó únicamente su nombre
en git status/diff. No se leyó, modificó ni revirtió ese archivo.

La migración siguiente libre es `0015_t18_verification_placement.sql`. Añade
`contract_signatories.placement` y `verification_codes`, incorpora los códigos
existentes como `legacy` y cambia la unicidad por firmante/versión de evidencia
por un índice no único. La secuencia contractual continúa siendo única. No
reescribe PDF, hashes, sellos ni payloads históricos. Se conserva el journal
existente y el patrón de migraciones SQL manuscritas de las tareas anteriores.

## Contrato HTTP para el front

Todas las rutas llevan el prefijo **`/api/v1`**. Las respuestas JSON de error
conservan `{ "error": { "code": "…", "message": "…", "details"?: … } }`.
Las rutas autenticadas mantienen los controles de sesión, correo confirmado,
cambio obligatorio de contraseña y origen de la API actual.

### Consulta pública: `GET /verify/:code`

Sin autenticación. Admite mayúsculas/minúsculas y código con/sin guiones.
Nuevo código: 16 símbolos Crockford en cuatro grupos de cuatro, por ejemplo
`7KQ4-M2XD-9PTA-WC3H`. No admite I, L, O ni U, espacios ni equivalencias de
caracteres ambiguos. Los históricos `SIM-` con veinte dígitos hexadecimales
también normalizan mayúsculas/guiones. **Un número `CT-…` nunca verifica.**

Un código desconocido o mal formado dentro del límite de ruta devuelve
**200 `{ "status": "not_found" }`**. Un código revocado por rotación devuelve
**200 `{ "status": "revoked" }`**, sin datos del contrato ni del código nuevo.

Un código registrado y no revocado devuelve 200 con esta forma exacta:

```ts
{
  status: 'registered' | 'revoked' | 'cancelled' | 'integrity_error',
  legacy: boolean,
  downloadAvailable: boolean,
  pageCount: number | null,
  title: string,
  code: string | null,
  activatedAt: string | null,
  revokedAt: string | null,
  signatoryCount: number,
  signatories: Array<{ name: string, signedAt: string | null }>,
  documentSha256: string | null,
  finalPdfSha256: string | null,
  auditChainValid: boolean,
  evidenceChainValid: boolean,
  systemSignatureValid: boolean,
  pdfIntegrityValid: boolean
}
```

Fechas ISO 8601. Los nombres son iniciales enmascaradas (`A*** P***`), sin
cédula, correo, IP, imagen, sesión, agente ni motivo privado. `pageCount` es
el número real de páginas del PDF persistido, incluida la constancia; es null
si falta o falla su integridad/lectura. `registered` significa que el registro,
las cadenas, el PDF oficial y el sello pasan la comprobación; **no autentica
un archivo presentado por un tercero**. El front debe pedir su comparación.

Cancelación tiene estado `cancelled`; una revocación contractual persistente
fuera de ese estado devuelve `revoked`. Una comprobación de integridad fallida
devuelve `integrity_error`. No se devuelve `valid` ni `invalid`.

Se reserva en `verify/types.ts` el estado `amended` y el campo opcional
`amendedBy: { verificationCode: string, title: string }` para T17. T18 no
devuelve todavía ese estado/campo ni inventa relaciones de enmienda.

Límite: **10/minuto por IP y ruta**. `Cache-Control: no-store`, también en
errores y 429. Entradas HTTP ajenas al contrato, como query inesperada,
producen 400. Se conserva el límite general de parámetros de ruta de 200
caracteres; rutas que lo excedan quedan fuera del matching del router.

### Comparar huella: `POST /verify/hash`

Sin autenticación, JSON estricto:

```json
{ "code": "7KQ4-M2XD-9PTA-WC3H", "sha256": "64 dígitos hexadecimales" }
```

`code`: string de hasta 200 caracteres; normaliza como GET. `sha256`: exactamente
64 caracteres hexadecimales, con mayúsculas o minúsculas. El navegador calcula
SHA-256 sobre los **bytes originales completos** del archivo; no lo sube.

200: **`{ "match": boolean, "status": <estado de GET> }`**. Código desconocido
o revocado por rotación: false y `not_found`/`revoked`. Un registro encontrado
puede devolver true aunque su estado sea cancelado o exista otro fallo de
integridad: la UI debe considerar **match y status**. Una diferencia de un byte
produce false. JSON inválido, hash inválido o claves extra: 400
`VALIDATION_ERROR`. Límite 10/minuto por IP/ruta, 429 `RATE_LIMITED`, `no-store`.

### Alternativa: `POST /verify/file`

Conserva el multipart: un solo archivo llamado `file`, MIME `application/pdf`,
cabecera `%PDF-`, máximo **15 MiB**; body HTTP máximo 16 MiB. Sin otros campos.
No persiste el archivo. PDF inválido: 400 `VALIDATION_ERROR`; excesivo: 413.

Sin coincidencia: 200
`{ "matches": false, "status": "not_found", "systemSignatureValid": false }`.
Con coincidencia: 200
`{ "matches": true, "code": string, "status": <estado>, "systemSignatureValid": boolean }`.
Conserva el plural **matches** de T10. Usa los estados nuevos. Tras rotar,
un original idéntico puede seguir coincidiendo y devuelve el código actual;
el QR antiguo sigue devolviendo únicamente `revoked`. Límite 10/minuto por
IP/ruta y `no-store`.

### Copia oficial marcada: `GET /verify/:code/pdf`

Sin autenticación. Requiere código actual no legacy, PDF final íntegro, cadenas
y sello correctos y contrato sin cancelación/revocación. Éxito: 200,
`Content-Type: application/pdf`,
`Content-Disposition: attachment; filename="copia-verificacion.pdf"`,
`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.

Añade en memoria a **cada página** «Copia de verificación — <fecha y hora de
Santo Domingo>». El original, su hash y su sello siguen intactos. **La huella
de la copia marcada es distinta:** para comparar hay que usar el archivo
original recibido por el interesado o su huella; no comparar la descarga
marcada con `finalPdfSha256` esperando igualdad.

Desconocido, mal formado, legacy, revocado o no descargable: 404 `NOT_FOUND`,
«No se encontró la copia de verificación.». Si el objeto cambia entre las
comprobaciones y la lectura bajo bloqueo: 409 `CONFLICT` por integridad.
Límites: **3/minuto por IP/ruta** y **5/minuto por código normalizado**,
compartido entre IP e instancias mediante PostgreSQL. 429 `RATE_LIMITED` con
`Retry-After`; los errores también llevan `no-store`. El presupuesto global
de la API continúa vigente.

Cada descarga realizada inserta `verification_pdf_downloaded` en la auditoría
contractual, con IP truncada (`198.51.*.*` o prefijo IPv6 enmascarado), sin
usuario, user-agent ni datos personales adicionales. Revalida el registro
del código después de tomar el bloqueo para respetar una rotación concurrente.

### Rotar: `POST /contracts/:id/verification-code/rotate`

Solo admin. `id` UUID. JSON estricto **`{ "reason": string }`**, recortado,
1–2000 caracteres. Requiere contrato con código y PDF final.

200:

```json
{ "message": "Código de verificación regenerado.", "verificationCode": "<nuevo código>" }
```

Errores: 400 `VALIDATION_ERROR` por entrada/motivo; 401 `UNAUTHORIZED` sin
sesión; 403 `FORBIDDEN` para otros roles; 404 `NOT_FOUND` si no existe;
409 `CONFLICT` sin PDF final/código. Auditoría `verification_code_rotated`
con actor, motivo y transición. Operación transaccional bajo bloqueo.

**Efecto sobre el QR:** no se regenera ni se vuelve a sellar el PDF final.
Su QR antiguo queda revocado sin datos. El código nuevo resuelve el mismo
original y verifica su sello usando el código histórico firmado, registrado
para ese mismo contrato. Propuesta para una constancia nueva: emitir otro
artefacto separado, con hash y sello propios, que cite el SHA-256 del original,
ambos códigos, fecha y evento de rotación y nuevo QR. Conservar ambos documentos;
no reemplazar el original ni atribuir a los firmantes la firma de esa constancia.
T18 no añade un endpoint ficticio para esa emisión.

### Firmar y volver a firmar: `POST /contracts/:id/sign`

Misma ruta autenticada y mismo multipart que T10, con un campo opcional nuevo:

| Campo | Contrato |
| --- | --- |
| `signature` | Un archivo PNG, máximo 500 KiB. |
| `acceptedDeclaration` | String literal `"true"`, obligatorio en cada firma/re-firma. |
| `viewedAt` | String ISO con zona, obligatorio; no futuro y posterior o igual a la frescura documental. |
| `method` | Opcional: `typed`, `drawn`, `uploaded`; omitido registra `unknown`. |
| `fontId` | Requerido para typed, lista cerrada existente; no admitido para los demás. |
| `placement` | Opcional: string JSON **`{"x": number, "y": number, "scale": number}`**, sin claves extra. |

Máximo un archivo, cinco campos y seis partes. No se admite identificador de
otro firmante. 200 conserva **`{ "message": "Firma registrada." }`**; obtener
después el detalle para leer colocación e imagen normalizadas vigentes.

Solo firma la identidad vinculada al usuario. Primera firma exige turno.
Re-firma se permite aunque haya firmado alguien después, **solo sobre la firma
propia y mientras el estado sea `pending_signatures` sin activación/PDF/sello**.
No cambia el documento, no reinicia otras firmas ni vuelve a notificar turnos
por una sustitución. La firma anterior conserva imagen y evidencia; la nueva
queda enlazada mediante `supersedesEvidenceHash`, evento `resigned`.

Se conserva 400 `VALIDATION_ERROR` para PNG, declaración, lectura, método o
colocación inválidos; 413 para exceso; 401 sin sesión; **404 `NOT_FOUND` para
quien no es firmante**, incluido admin; 409 `CONFLICT` fuera de turno o después
de activar. Un reintento idéntico antes de activar (imagen normalizada, método,
fuente y colocación iguales) no duplica evidencia. Después de activar devuelve
409, también al repetir una firma.

### Ajustar: `PATCH /contracts/:id/signatures/me/placement`

Autenticada. `id` UUID. JSON estricto:

```json
{ "placement": { "x": 0.7, "y": 0.4, "scale": 0.6 } }
```

200: **`{ "message": "Colocación ajustada.", "placement": { x, y, scale } }`**,
con los valores efectivos tras clamp. Requiere firma propia ya registrada y
contrato todavía pendiente sin activación/PDF/sello. No permite indicar otra
persona, tampoco al admin. 400 por entrada inválida/campos extra; 401 sin
sesión; 404 si no es firmante; 409 sin firma previa, sin evidencia o después de
activar. Se aplica la admisión de almacenamiento existente: saturación 503
`RATE_LIMITED` con `Retry-After`.

Conserva fecha, imagen, identidad, aceptación y sesión de la firma original.
Añade evidencia `placement_adjusted` con la colocación nueva, enlace a la
evidencia anterior, fecha, sesión, IP y agente del ajuste; audita
`signature_placement_adjusted`. Un ajuste que deja los mismos valores no
duplica evidencia. Requiere el mismo bloqueo que la última firma: gana el
ajuste y se incluye en el PDF, o gana la activación y el ajuste recibe 409.

### Detalle: campos nuevos de `GET /contracts/:id`

Conserva la respuesta existente y añade:

```ts
{
  signatories: Array<{
    // demás campos existentes, incluido signatureFileId
    placement: { x: number, y: number, scale: number } | null
  }>,
  can: {
    // demás permisos existentes
    adjustSignature: boolean
  },
  signatureSlot: null | {
    page: number,
    slotIndex: number,
    x: number,
    y: number,
    width: number,
    height: number
  }
}
```

`signatureSlot` es únicamente la casilla del actor: null si no es firmante;
disponible también antes de firmar. `page` empieza en **1**, `slotIndex` en **0**
y sigue el orden documental/signingOrder del PDF. Las medidas son fracciones
de la página completa: origen arriba a la izquierda. Rectángulo:
`(x * anchoPágina, y * altoPágina, width * anchoPágina, height * altoPágina)`.
Es el área de imagen situada sobre la línea, sin nombre/cédula/fecha. La
geometría se obtiene de la paginación real con el mismo motor del PDF y un
ancla fija; no se calcula contando caracteres ni depende del desplazamiento
de la imagen.

`can.adjustSignature` es true solo para la firma propia ya registrada en
contrato modificable. Usarlo también para ofrecer re-firma: `can.sign` sigue
representando la primera firma pendiente/en turno. Recargar detalle y preview
tras firmar/ajustar; el front debe reflejar los valores efectivos del servidor.

### Colocación y normalización: reglas para reproducir la vista previa

- `placement.x/y` son el **centro relativo a la casilla**, origen arriba a la
  izquierda. Ausente: `{ x: 0.5, y: 0.5, scale: 1 }`.
- El servidor acepta números finitos y hace clamp: **scale entre 0.5 y 1**,
  centro entre los bordes que permiten contener la imagen completa. Se eligió
  1 como máximo porque ya representa el mayor encaje posible; ampliar más
  obligaría a recortar el trazo. Valores extremos finitos se ajustan; strings,
  null, claves extra o JSON inválido se rechazan.
- Con imagen normalizada `Iw × Ih` y casilla `Bw × Bh`:
  `fit = min(Bw/Iw, Bh/Ih) * scale`, `W=Iw*fit`, `H=Ih*fit`;
  `x=clamp(x,W/(2*Bw),1-W/(2*Bw))` e igual para y.
  Esquina superior: `(x*Bw-W/2, y*Bh-H/2)`.
- Antes de cifrar/hashear: saneado PNG de T09b, recorte de bordes completamente
  transparentes, margen de cuatro píxeles limitado al lienzo y reducción
  proporcional a máximo **1000 × 500**. Se rechaza una imagen totalmente
  transparente. Se conserva la relación de aspecto. El hash de evidencia cubre
  los bytes recodificados y normalizados, no el PNG enviado.
- La evidencia nueva usa `simaud-evidence-v2`; se siguen verificando v1 y todos
  los archivos históricos. Cada fila conserva su hash y el enlace global;
  además se comprueba la sucesión por firmante/versión y se compara la última
  evidencia con la firma vigente. Los ajustes conservan los datos originales.

### Catálogo, preview y cédulas

`GET /templates/:id` añade **`hasSignatureBlock: boolean`**. Es true si existe
un bloque estructurado de firmas, false en plain o documentos sin él. No
intenta interpretar líneas manuales `____`; el front puede avisar al editar.

`GET /templates` conserva filtros `status`, `q`, `category`, con objeto estricto,
`q` máximo 200 y `category` máximo 1000. Usa `escapeLike()` para buscar `%`, `_`
y barra invertida literalmente. Catálogo/preview/capabilities rechazan query,
params/body extra cuando no los esperan; duplicar espera body vacío. Preview
conserva su esquema estricto y presupuestos existentes. PDF contractual acepta
solo query `final=true|false` opcional. Las entradas inválidas devuelven 400.

Cédulas de once dígitos se muestran `000-0000000-0` en casillas y variables
de tipo cedula/`cliente_cedula`, independientemente de sus separadores guardados.
La constancia conserva el enmascarado con separadores. No se reescribe el
contenido ni los PDF firmados anteriores para cambiar su presentación.

## Operación, decisiones y límites

- Códigos nuevos: CSPRNG, 16 símbolos independientes de cinco bits (**80 bits**).
  Búsqueda normalizada indexada y comparación de buffers mediante
  `timingSafeEqual`; huellas también se comparan en tiempo constante. Los
  códigos T10 ya tenían 80 bits, pero se conservan como legacy al cambiar el
  alfabeto; no se invalida ningún QR por migración.
- `pdf-lib` 1.17.1 es la única dependencia directa nueva. La marca se dibuja
  en una copia en memoria; no hay escrituras de esa copia en storage ni cambios
  al sello detached. No se añaden PAdES, TSA ni acreditación legal.
- Los límites IP siguen siendo por proceso; el límite por código usa la BD.
  El código largo permite obtener contenido del contrato: tratar el QR como
  una capacidad de acceso y no publicarlo en listados o telemetría.
- La consulta pública usa una transacción read-only/repeatable-read. Si concurre
  con una rotación, responde desde una instantánea coherente y nunca mezcla
  el código anterior con el nuevo; las descargas revalidan además bajo bloqueo.
- La IP real depende de la frontera de proxies. Se documenta nginx con un salto,
  Instabox con dos, saneado de XFF y bloqueo de acceso directo. Las pruebas
  simulan esos saltos; no se afirma haber validado una infraestructura remota.
- No se modificó DATABASE_URL_TEST. Todas las pruebas se ejecutaron desde Git
  Bash contra la BD local heredada **simaud_test2, 127.0.0.1:55433**. La guarda
  verifica ese destino sin imprimir la URL y dotenv apunta a un archivo
  inexistente. No se migró la BD de desarrollo/producción.

## Verificación

| Comprobación | Resultado |
| --- | --- |
| Pruebas T18 dirigidas | **23/23 aprobadas**, cinco archivos, 27,23 s; la carrera consulta/rotación posterior eleva a **24** los casos propios, todos aprobados en la suite final. |
| Regresión T18 + T10/T13/T15 anterior | **36/36 aprobadas**, siete archivos, 52,21 s; después se añadieron las tres pruebas de aviso/maqueta incluidas en las 23 propias. |
| `npm run typecheck` | Correcto. |
| `npm run format:check` | Correcto, global de api/src y api/test. |
| `npm run build` | Correcto. |
| Suite completa final | **58/58 archivos aprobados; 666 pruebas aprobadas y una omitida, cero fallos**, salida 0, **280,09 s**. |
| `git diff --check` del alcance propio | Correcto. |

La primera pasada completa terminó con 664 aprobadas, una fallida y una
omitida (288,03 s). El único fallo era la expectativa heredada de
`contracts.test.ts` que prohibía repetir una firma antes de activar; se cambió
a 200 idempotente y se añadió el rechazo 409 después de activar. La pasada
final parte de un proceso nuevo y añade la carrera consulta/rotación.
La omisión corresponde al test de permisos POSIX 0700/0600, exclusivo de Linux.

Logs finales: `api/tmp/t18-typecheck.log`, `t18-format-check.log`,
`t18-build.log` y `t18-full-suite-final.log`. No quedan fallos reproducidos
ni verificaciones obligatorias pendientes en el alcance de T18.

Las pruebas cubren código/normalización/opacidad, legacy, huella de archivo
alterado en un byte, marca en cada página, hash de copia distinto y original
intacto, rotación, límites por IP/código, clamp extremo, recorte/imagen vacía,
ajuste y re-firma después de otro firmante, rechazo tras activar, aislamiento
del admin, idempotencia, compatibilidad v1/v2 y ambas carreras de ajuste frente
a última firma mediante barreras, sin sleeps. Incluyen backfill de 0015 en
esquema sintético con rollback, geometría en página real y cédula PDF.

Se renderizaron PDF sintéticos con PyMuPDF y se inspeccionaron la constancia
marcada y las casillas colocadas. La lectura de los rectángulos de imagen del
PDF final confirma contención dentro de la casilla y coincidencia del centro
con placement persistido. Artefactos y logs quedan ignorados en `api/tmp/t18-*`.
Las expectativas heredadas de T10/T13/T15 se actualizaron únicamente para los
nuevos estados de verificación.

Reproducción desde Git Bash, con DATABASE_URL_TEST ya heredada:

```sh
cd api
export DOTENV_CONFIG_PATH="$PWD/tmp/t18-no-dotenv"
export NODE_ENV=test MAIL_DRIVER=log JOBS_ENABLED=false
export DATABASE_URL="${DATABASE_URL:-postgresql://unused:unused@localhost/simaud_unused}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-t18-synthetic-test-key-at-least-32-characters}"
export APP_URL="${APP_URL:-http://localhost:5173}"
node -e 'const u = new URL(process.env.DATABASE_URL_TEST); if (u.pathname !== "/simaud_test2" || u.hostname !== "127.0.0.1" || u.port !== "55433") process.exit(1)'
npm run typecheck
npm run format:check
npm run build
npm test -- --reporter=verbose
```

No se asigna ni se imprime DATABASE_URL_TEST; los valores alternativos son
sintéticos y solo se usan para permitir arrancar las pruebas sin dotenv.
