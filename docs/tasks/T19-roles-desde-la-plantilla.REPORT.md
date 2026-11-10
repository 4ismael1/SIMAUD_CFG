# T19 — Roles de firmante desde la plantilla y cargo

Fecha: 10 de noviembre de 2026.

## Resultado y alcance

Implementados los roles por casilla, las variables implícitas de personas, el cargo
de usuario y la colocación PDF independiente del turno. La implementación y las
pruebas están en `api/`; este informe es la única escritura fuera de ese directorio.
No se modificó `src/`, no se hizo commit, no se leyó `api/.env` ni se imprimieron
secretos. Se leyeron CODE_STANDARDS, PRINCIPIOS y los informes T13, T15, T16, T17 y T18.

Migración siguiente libre: **`0017_t19_template_roles.sql`**, registrada después de
0016. Añade `users.position`, `contract_signatories.role_label` y `slot_index`,
un check de longitud de cargo, un check de índice no negativo y un índice único
por contrato/casilla no nula. No añade tablas ni dependencias ni regenera snapshots
históricos de Drizzle.

## Contrato HTTP exacto para el front

Todas las rutas llevan el prefijo **`/api/v1`**. Conservan bearer, sesión válida,
correo confirmado y los controles existentes de contraseña/origen. Los objetos
de entrada son estrictos: los campos no documentados se rechazan con 400. Error:

```ts
{ error: { code: string; message: string; details?: unknown } }
```

### Documento y detalle de plantilla

En `rich-v2`, cada `signatureSlot.attrs` acepta:

```ts
{
  label: string;      // Rol visible, 1–60 caracteres en contenido NUEVO de plantilla
  party?: string;    // /^[a-z][a-z0-9]{0,29}$/, único en todo el documento
  showName?: boolean | null;
  showId?: boolean | null;
}
```

`party` se omite si no se usa; no acepta null. `showName` y `showId` omitidos o
null equivalen a true. Se rechazan etiquetas vacías o solo con espacios al crear
una plantilla o enviar otro contenido mediante PATCH. Las etiquetas históricas
vacías siguen siendo válidas para lectura, hash, duplicación sin cambios de
contenido y edición de metadatos. El esquema histórico ya exigía la clave label.

**`GET /templates/:id` — 200** conserva su respuesta y añade:

```ts
{
  hasSignatureBlock: boolean;
  signatureSlots: Array<{
    index: number;
    label: string;
    party: string | null;
    showName: boolean;
    showId: boolean;
  }>;
  variables: string[];
  resolvedVariables: Array</* definición existente del catálogo */>;
}
```

`index` empieza en **0** y recorre todas las casillas de todos los bloques Firmas
en orden documental. No es el turno de firma. Sin casillas: `signatureSlots: []`;
plain/rich-v1 conservan el flujo anterior. `party` ausente en el JSON documental
se representa como null en este DTO. La forma de POST/PATCH de plantillas se
mantiene; las casillas se envían dentro de `content`.

`variables` y `resolvedVariables` contienen únicamente los campos que se piden
en Datos. Excluyen los cinco campos implícitos de cada party declarado, incluso
si esos nombres existen también en el catálogo. El catálogo global `/variables`
conserva sus entradas antiguas; el asistente debe usar las definiciones resueltas
de la plantilla para construir Datos. No se crean roles ni variables en catálogo
al guardar una plantilla. Preview JSON y PDF reconocen las variables implícitas.

### Crear contrato con casillas

**`POST /contracts` — admin o gestor; 201 con el detalle contractual existente.**

```json
{
  "templateId": "00000000-0000-4000-8000-000000000019",
  "title": "Contrato de arrendamiento",
  "variables": {},
  "value": "100.00",
  "startDate": "2026-11-01",
  "endDate": "2027-11-01",
  "signatories": [
    { "name": "Ana Ejemplo", "email": "ana@example.com", "slotIndex": 0, "signingOrder": 3 },
    { "name": "Bruno Ejemplo", "email": "bruno@example.com", "slotIndex": 1, "signingOrder": 1 },
    { "name": "Carla Ejemplo", "email": "carla@example.com", "slotIndex": 2, "signingOrder": 2 },
    { "name": "Diego Ejemplo", "email": "diego@example.com", "slotIndex": null, "role": "witness", "signingOrder": 4 }
  ]
}
```

El ejemplo presupone una plantilla existente con tres casillas. Se conservan
`content?` y `notes?: string | null`, las reglas de fechas, dinero y las variables
ordinarias del contrato. `value` acepta el decimal anterior; el front debe enviar
un string decimal exacto.

Cada firmante admite **solo**:

```ts
{
  name: string;         // Nombre completo, 2–120; validación y normalización existentes
  email: string;        // Validado, recortado y convertido a minúsculas
  phone?: string;       // Teléfono DO; se normaliza a diez dígitos
  cedula?: string;      // Cédula válida; se normaliza a once dígitos
  slotIndex?: number | null;
  role?: 'client' | 'contractor' | 'witness';
  signingOrder?: number; // Entero 1–1000
}
```

- Debe existir **exactamente una persona por casilla**: índices 0…n−1, sin huecos
  ni repeticiones. El orden del array no cambia esa asignación.
- Para casillas, enviar `slotIndex` numérico y omitir `role`. Si se envía un enum
  válido, el servidor lo sustituye: `client` cuando party es `cliente`,
  `contractor` para las otras casillas. `roleLabel` procede del label documental.
- Para un testigo extra, enviar `slotIndex: null` u omitirlo y enviar
  **`role: "witness"`**. Máximo **10 extras** y **100 firmantes totales**.
- `signingOrder` es opcional con casillas: por defecto index + 1; los extras
  continúan después de n según su orden en el array. Puede editarse sin mover
  a la persona de casilla. Se conserva la semántica anterior de turnos iguales.
- No se aceptan `roleLabel`, `position`, `userId`, ID contractual de firmante ni
  datos de firma en el body. El servidor calcula etiquetas y vínculos de acceso.
- No se repiten correo, cédula ni usuario vinculado dentro del mismo contrato.
- Las casillas/roles/party de `content` propio deben conservar los de la plantilla.
  Se permite editar el resto del documento y su distribución visual.

### Variables implícitas de personas

Para cada casilla con `party: p`, el servidor completa y persiste:

| Variable | Fuente exacta |
| --- | --- |
| `p_nombre` | Nombre normalizado del firmante asignado. |
| `p_cedula` | Cédula del firmante con formato `000-0000000-0`; string vacío si falta. |
| `p_email` | Correo normalizado del firmante. |
| `p_telefono` | Teléfono normalizado del firmante; string vacío si falta. |
| `p_cargo` | `position` del usuario activo, no eliminado y con correo confirmado que coincide con el correo del firmante; string vacío si no existe o no tiene cargo. |

No se usa una cédula editable para conceder acceso ni para obtener el cargo de
otra cuenta. Los vínculos de firma conservan las reglas de identidad de T09b/T16.
Los cinco valores se generan aunque no todos aparezcan en el cuerpo documental.
Los campos vacíos se renderizan en blanco en lugar de dejar marcadores pendientes.

**Decisión de validación:** el front debe omitir esos nombres de `variables`.
Si los envía, se aceptan solamente cuando coinciden **exactamente** con el valor
normalizado que calcula el servidor; en otro caso, **400 `VALIDATION_ERROR`**,
con `details: [{ field: "variables.<nombre>", message: "El valor difiere del firmante." }]`.
Esto incluye cédula con guiones y teléfono de diez dígitos. No se confía en cargos
ni nombres enviados como variables.

Sin un party declarado, las variables del catálogo `cliente_*` y
`representante_*` continúan con su comportamiento anterior. Cuando una casilla
declara ese prefijo, prevalece el firmante y dejan de pedirse esos campos en Datos.

### Editar contrato

**`PATCH /contracts/:id` — admin o gestor responsable; 200 con el detalle.**
Conserva el PATCH parcial de campos contractuales. Body de ejemplo:

```json
{
  "signatories": [
    { "name": "Ana Ejemplo", "email": "ana@example.com", "slotIndex": 0, "signingOrder": 2 },
    { "name": "Bruno Ejemplo", "email": "bruno@example.com", "slotIndex": 1, "signingOrder": 3 },
    { "name": "Carla Ejemplo", "email": "carla@example.com", "slotIndex": 2, "signingOrder": 1 }
  ]
}
```

Si se envía `signatories`, es el **array completo que reemplaza al anterior**,
incluidos los testigos que se quieran conservar. Omitir un testigo lo retira.
Omitir `signatories` conserva personas, casillas y turnos. Omitir `variables`
conserva los datos ordinarios y recalcula los de party; enviarlo reemplaza el mapa
de valores conforme al contrato existente. No reenviar valores implícitos antiguos
si se ha cambiado una persona o su cargo.

Un cambio de cargo de usuario no reescribe contratos ni versiones: se aplica en
la siguiente creación/edición permitida. Cada edición crea otra versión. Se mantienen
los bloqueos de edición de T17/T18; no se modifica contenido firmado ni PDF final.
Una enmienda o renovación conserva inicialmente las asignaciones y los valores
históricos copiados; la edición del borrador recalcula los datos de personas.

Si se cambia `templateId`, se aplican las casillas de la plantilla nueva; enviar
el array completo cuando cambie su número o asignación. Editar solo el catálogo
no cambia los contratos que ya existían. El `content` de un contrato no permite
añadir, eliminar, renombrar o cambiar el party de las casillas de su documento base.

Sin casillas, o con plain/rich-v1, siguen siendo obligatorios `role` y
`signingOrder` en cada persona; `slotIndex` debe omitirse o ser null. La etiqueta
visible es `Cliente`, `Contratista` o `Testigo`, según el enum antiguo.

### Respuestas de contratos, bandeja y firma

`GET /contracts/:id`, y las respuestas de creación/edición, conservan sus campos.
Cada `signatories[]` añade:

```ts
{
  role: 'client' | 'contractor' | 'witness'; // Compatibilidad; no usar para el texto visible
  roleLabel: string;                      // Texto que debe mostrar el front
  slotIndex: number | null;               // null para extras o flujo sin casillas
  signingOrder: number;                   // Turno independiente de slotIndex
}
```

`GET /contracts` conserva `data/meta`; cada `data[]` incorpora un resumen
`signatories: Array<{ id, name, role, roleLabel, slotIndex, signingOrder, status }>`.
Este resumen no incorpora correo ni cédula. Los conteos `signatures` se mantienen.

`GET /me/signatures?status=pending|signed&page=1&pageSize=20` conserva `data/meta`;
`data[].signatory` añade `roleLabel` y `slotIndex` junto a los campos anteriores.
El dashboard del usuario añade esos dos campos a sus filas. Las notificaciones
para un firmante incluyen `data.roleLabel` y `data.slotIndex`; sus SSE conservan
la misma forma de notificación. Las versiones y los eventos nuevos de creación,
edición y firma conservan etiqueta y casilla. La constancia PDF usa `roleLabel`.

`signatureSlot` de T18 conserva exactamente su forma:

```ts
null | {
  page: number; slotIndex: number;
  x: number; y: number; width: number; height: number;
}
```

Su `slotIndex` identifica la **casilla renderizada**, con base cero. Para una
persona asignada coincide con su `signatories[].slotIndex`; para un testigo extra
es n + su posición entre los extras ordenados por turno, aunque el campo
persistido del testigo sea null. Página y medidas conservan la definición de T18.
Solo se devuelve la geometría del actor. Las imágenes, el clamp de colocación y
la normalización usan esa misma casilla. Los testigos se añaden al final en
bloques de hasta dos personas con etiqueta `TESTIGO`; no ocupan casillas del documento.

No cambia el multipart de firma, la ruta de ajuste ni la política de turnos de
T18. La verificación pública conserva sus DTO enmascarados: no añade roles,
party, cargos, cédulas, correos ni geometría.

### Cargo del usuario

**`PATCH /users/:id` — admin**, y **`PATCH /me` — propio usuario**:

```json
{ "position": "Directora administrativa" }
```

Aceptan string recortado de **0–120 caracteres**, o null para quitar el cargo.
Campo omitido = conservar el valor. Ambos devuelven **200 `{ user: <usuario> }`**
con `user.position: string | null`. Mantienen los demás campos editables existentes.
`POST /users` administrativo también admite `position` opcional con la misma regla.
El registro público conserva su esquema previo.

`GET /me` devuelve el usuario directamente con `position`.
`GET /users` lo incluye en cada `data[]`; `GET /users/:id` devuelve el usuario
directamente. `GET /users/lookup?cedula=<cédula>` conserva su respuesta
`{ id, name, email, phone, cedula }` y añade `position: string | null`.
Las respuestas autenticadas que ya usaban el DTO público de usuario también lo
incluyen. Cargo ausente en usuarios existentes = null.

Admin y usuario dejan auditoría `user.updated`, con `fields: ["position"]`
cuando ese es el único cambio. Un usuario sin rol admin no puede editar a otro
por `/users/:id` (403); `/me` no admite un ID de destino ni claves adicionales (400).
Exceso de longitud, tipos distintos de string/null o claves extra: 400.

### Errores y límites

| HTTP / code | Casos relevantes |
| --- | --- |
| 400 / `VALIDATION_ERROR` | Casilla ausente/repetida/fuera de rango; extra distinto de witness o más de diez; roles/campos/fechas inválidos; party inválido/duplicado; etiqueta nueva vacía; variables de personas discrepantes; intento de cambiar casillas mediante content; falta de datos ordinarios requeridos. |
| 401 / `UNAUTHORIZED` | Sin sesión válida. |
| 403 / `FORBIDDEN` | Rol sin acceso a la operación. |
| 404 / `NOT_FOUND` | Recurso inexistente o contrato fuera del alcance del actor. |
| 409 / `CONFLICT` | Contrato fuera de los estados editables o protegido por activación/PDF/sello. |

Se mantienen los presupuestos HTTP y de recursos de las tareas anteriores.

## Integridad y decisiones

- La canonicalización solo añade party si está presente y conserva los bytes
  canónicos de documentos anteriores. No se reescriben contenido, versiones,
  evidencia, hashes ni PDF históricos.
- El backfill de casillas reproduce la asignación histórica por signingOrder e ID
  antes de pasar al modelo estable. Conserva incluso un witness que históricamente
  ocupaba una casilla. Los roles visibles provienen del label cuando existe y
  recurren a la traducción del enum si la etiqueta histórica está vacía.
- La migración mantiene un fallback de etiqueta para importadores antiguos que
  solo escriben role. El tráfico HTTP nuevo obtiene las etiquetas del servidor.
- La reconciliación libera las asignaciones antes de permutarlas, dentro de la
  misma transacción; los errores revierten contrato, variables, personas y versión.
- El renderizador compartido ya no reasigna personas según el turno. El PDF,
  la constancia y la geometría usan la misma asignación, incluidos enmiendas y
  renovaciones. Las evidencias nuevas incluyen roleLabel/slotIndex y verifican
  esos campos; las evidencias v1/v2 históricas sin ellos siguen siendo válidas.
- Se extrajo la escritura contractual de las rutas a `writes.ts`; las reglas de
  personas están en `slot-signatories.ts` y los metadatos en `rich-doc/slots.ts`.
  La consulta por lotes del listado conserva su presupuesto constante.
- No quedan decisiones pendientes ni atajos de implementación intencionales.

Se generó además una maqueta sintética de dos páginas con cuatro trazos distintos
y turno 1→2→0→testigo. Se renderizaron e inspeccionaron ambas páginas con PyMuPDF
(Poppler no está disponible en este entorno). Se contrastaron los rectángulos de
imagen extraídos del PDF con las cuatro geometrías emitidas por el motor: cada
trazo corresponde a su persona y queda contenido en la casilla prevista. Nombres,
cédulas formateadas y etiquetas se leen sin solapamientos ni recortes. Son datos
y trazos artificiales, no firmas reutilizadas de usuarios.

## Verificación

Las comprobaciones se ejecutan desde **`C:/Program Files/Git/bin/bash.exe`**.
`DATABASE_URL_TEST` se conserva heredada y se valida sin imprimirla:
PostgreSQL local **simaud_test2, 127.0.0.1:55433**. Dotenv apunta a un archivo
inexistente; no se carga `api/.env` ni se migra la BD de desarrollo/producción.

| Comprobación en api/ | Resultado final |
| --- | --- |
| `npm run typecheck` | Correcto, salida 0. |
| `npm run format:check` | Correcto para todo src/test de la API, salida 0. |
| `npm run build` | Correcto, salida 0. |
| `npm test -- --reporter=verbose` | **68/68 archivos; 726 pruebas aprobadas, una omitida, cero fallos; salida 0; 328,97 s.** |
| Pruebas propias T19 incluidas en esa suite | **12/12 aprobadas**, cinco archivos de pruebas. |
| `git diff --check` | Correcto. |

La única omisión es la comprobación de permisos POSIX de disco, exclusiva de
Linux. La primera pasada completa terminó con 725 aprobadas, una fallida y una
omitida en 315,53 s: `core.test.ts` comparaba los cinco campos antiguos de lookup
y rechazaba el nuevo position. Se actualizó únicamente esa expectativa; también
se adaptó el fixture HTTP de T15 para enviar slotIndex al crear con casillas.
La tabla corresponde a la segunda ejecución completa, desde un proceso nuevo y
con el código y las pruebas cerrados. No se retiraron pruebas ni se cambiaron
umbrales. No quedan verificaciones obligatorias pendientes.

Cobertura propia: tres casillas personalizadas con cargo y cédula formateada,
testigo opcional, casillas faltantes/repetidas, valores implícitos discrepantes,
permutación atómica al editar, límite de extras, compatibilidad del catálogo y
formatos anteriores, validación de party/label, conservación de hashes y backfill,
cargo propio/administrativo y aislamiento, geometría y nombre/imagen/etiqueta PDF
en otro orden de firma, constancia/evidencia, bandeja/notificaciones, privacidad
pública y copia a enmienda/renovación. Las regresiones anteriores siguen incluidas.

Logs: `api/tmp/t19-typecheck-final.log`, `t19-format-check-final.log`,
`t19-build-final.log` y `t19-full-suite-final.log`, ignorados por git.
La pasada inicial se conserva en `api/tmp/t19-full-suite-initial.log`.

Reproducción desde Git Bash, conservando `DATABASE_URL_TEST` heredada:

```sh
cd api
export DOTENV_CONFIG_PATH="$PWD/tmp/t19-no-dotenv"
export NODE_ENV=test MAIL_DRIVER=log JOBS_ENABLED=false
export DATABASE_URL="${DATABASE_URL:-postgresql://unused:unused@localhost/simaud_unused}"
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-t19-synthetic-test-key-at-least-32-characters}"
export APP_URL="${APP_URL:-http://localhost:5173}"
node -e 'const u = new URL(process.env.DATABASE_URL_TEST); if (u.pathname !== "/simaud_test2" || u.hostname !== "127.0.0.1" || u.port !== "55433") process.exit(1)'
npm run typecheck
npm run format:check
npm run build
npm test -- --reporter=verbose
```

Los valores alternativos son sintéticos y únicamente permiten arrancar las
pruebas sin dotenv. No se asigna ni se imprime `DATABASE_URL_TEST`.
