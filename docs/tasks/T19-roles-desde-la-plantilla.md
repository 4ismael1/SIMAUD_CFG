# T19 — Roles de firmante definidos por la plantilla + «Cargo» (lanzar DESPUÉS de T17)

**Asignado a:** Codex · **Revisa:** Claude (y hace el editor y el asistente). Lee `docs/PRINCIPIOS.md`,
`docs/CODE_STANDARDS.md` y los informes T13, T15, T16, T17 y T18. Solo `api/`. Sin commit, sin secretos, sin leer `api/.env`.

## Decisión del dueño (10 nov 2026)
Los roles de firmante **no son fijos del sistema**: los define cada plantilla. Cada casilla del bloque «Firmas» es un rol
(«EL CONTRATISTA», «POR LA INSTITUCIÓN», «EL ARRENDADOR», «EL VAGABUNDO»…). Al crear un contrato hay **un firmante por casilla**
con ese rol ya puesto. **«Testigo»** queda como único rol fijo, **opcional y extra**. Con 100 plantillas no se crean roles a mano.

## Modelo
1. **Casilla (rich-v2, `signatureSlot.attrs`)**: además de `label` (= nombre del rol, 1–60), `showName`, `showId`, añadir
   `party` opcional: prefijo de datos `^[a-z][a-z0-9]{0,29}$` (p. ej. `cliente`, `representante`, `arrendador`). Único por
   documento entre casillas. Canonicalización estable (omitir si falta) para no cambiar hashes de documentos existentes.
   Las casillas sin `label` ya no se admiten en contenido NUEVO de plantillas (los documentos antiguos siguen siendo válidos).
2. **Datos de las personas («party variables»)**: para cada casilla con `party = p`, las variables `{p}_nombre`, `{p}_cedula`,
   `{p}_email`, `{p}_telefono` y `{p}_cargo` son **implícitas**: no necesitan existir en el catálogo de variables, no se
   piden en «Datos» y **las rellena el servidor** desde el firmante de esa casilla al crear/editar el contrato (nombre,
   cédula con formato, correo, teléfono, cargo del usuario). Si el cliente envía valores para ellas, se ignoran o 400
   (decidir y documentar; recomendado: 400 si difieren). Compatibilidad: `cliente_*` y `representante_*` del catálogo actual
   siguen funcionando; si una casilla declara ese `party`, gana el dato del firmante.
3. **Firmante (`contract_signatories`)**: añadir `role_label text` (lo que se muestra: el `label` de su casilla o «Testigo»)
   y `slot_index int null` (índice documental de su casilla; null = extra). Mantener la columna enum `role` por compatibilidad
   (casillas → `contractor`/`client` según convenga, extras → `witness`) y documentar que el front debe mostrar `roleLabel`.
4. **Crear/editar contrato** desde plantilla con casillas: exigir **exactamente un firmante por casilla** (`slotIndex` 0…n-1,
   sin repetir) más **testigos opcionales** (`slotIndex` null, rol testigo, máximo razonable). El `roleLabel` lo pone el
   servidor desde la plantilla (no se confía en el cliente). El **orden de firma** es editable y por defecto el de las casillas.
   Plantillas sin casillas o `plain`/`rich-v1`: comportamiento actual (roles client/contractor/witness).
5. **PDF y geometría (T15/T18)**: asignar firmante → casilla por **`slot_index`** (ya no por orden de firma). Los testigos y
   firmantes sin casilla van en casillas añadidas al final con etiqueta `TESTIGO` (o su `roleLabel`). `signatureSlot` del
   detalle (T18) debe seguir apuntando a la casilla correcta.
6. **«Cargo» en usuarios**: columna `position text null` (≤120). Editable por admin en `PATCH /users/:id` y por el propio
   usuario en `/me`; devuelto en usuarios, `/me` y en la búsqueda por cédula que usa el asistente. Rellena `{party}_cargo`.
7. **Exponer**: `GET /templates/:id` devuelve `signatureSlots: [{ index, label, party, showName, showId }]` (además de
   `hasSignatureBlock`). Detalle/lista/bandeja/notificaciones/constancia/auditoría usan `roleLabel`. Verificación pública
   sigue sin datos personales.

## Pruebas obligatorias
Plantilla con 3 casillas y `party` personalizados (`arrendador`, `arrendatario`, `fiador`) → contrato con 3 firmantes +
1 testigo; variables implícitas rellenadas por el servidor (incluido cargo y cédula con formato); faltar/repetir casilla →
400; valores de party enviados por el cliente que difieren → según decisión; PDF con cada firma en su casilla por
`slot_index` aunque el orden de firma sea distinto; testigo en casilla añadida «TESTIGO»; plantillas antiguas sin casillas
siguen igual; `party` duplicado o inválido → 400; hashes de documentos existentes sin cambios; edición de cargo (admin y
propio usuario), y un usuario no edita el cargo de otro. Migración con el siguiente número libre. Suite completa en verde.

## Entrega
Informe `docs/tasks/T19-roles-desde-la-plantilla.REPORT.md` con el contrato HTTP exacto para el front (cuerpos de
creación/edición de contrato con `slotIndex`, forma de `signatureSlots`, `roleLabel`, `position`).
