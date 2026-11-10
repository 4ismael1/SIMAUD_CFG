# T18 — Verificación pública v2 y colocación de firmas (lanzar DESPUÉS de commitear T15 y T16; ANTES de T17)

**Asignado a:** Codex · **Revisa:** Claude (y hace todo el front). Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md`
y los informes T10, T14, T15 y T16. Solo `api/` (no tocar `src/`). Sin commit, sin imprimir secretos, sin leer `api/.env`.

## Decisiones del dueño (10 nov 2026)
1. Un código válido **no debe hacer pasar por auténtico un PDF falso**. Solo la comparación del archivo demuestra autenticidad.
2. Con el **código largo del QR** se puede **ver y descargar la copia oficial** del PDF final, con protecciones.
3. El firmante ve su firma **dentro de su casilla** antes de confirmar, puede **moverla y ajustar su tamaño** (sin salir de
   la casilla) y puede **corregir su colocación o volver a firmar** mientras el contrato no esté activo. Tras la activación
   nada cambia (para eso existe la enmienda, T17). Nadie mueve la firma de otro, tampoco el admin.

## Parte A — Verificación pública v2
- **Código de verificación no adivinable**: generar con CSPRNG ≥ 80 bits, alfabeto Crockford base32 sin ambiguos, en
  grupos (`7KQ4-M2XD-9PTA-WC3H`), normalizando mayúsculas/guiones al consultar y comparando en tiempo constante. Revisar cómo
  se genera hoy `contracts.verification_code` (T10); si es predecible o corto, migrarlo **sin invalidar los PDF ya sellados**:
  los códigos antiguos siguen resolviendo (marcados `legacy`) y no permiten descarga. El número `CT-…` nunca verifica.
- `GET /verify/:code` (público, límites actuales o más estrictos) devuelve **datos de comparación**, nunca la palabra
  «válido» para el documento: `status: 'registered' | 'revoked' | 'amended' | 'cancelled' | 'not_found' | 'integrity_error'`,
  título, fecha de activación, número de páginas del PDF final, firmantes (iniciales enmascaradas) con fecha de firma,
  `finalPdfSha256`, resultados de las cadenas y del sello, `downloadAvailable`. Respuesta uniforme para no revelar existencia
  con códigos mal formados. Dejar sitio (campo opcional) para «sustituido por la enmienda X» que rellenará T17.
- **Comprobación por huella** `POST /verify/hash` `{ code, sha256 }`: el navegador calcula SHA-256 del archivo (no se sube).
  Devuelve `match: true|false` contra el PDF final del código. Mantener `POST /verify/file` existente como alternativa.
  Mismos límites y `no-store`.
- **Copia oficial** `GET /verify/:code/pdf`: solo con código no `legacy` y contrato con PDF final. Devuelve los bytes del
  PDF final con una marca «Copia de verificación — <fecha>» **añadida en una copia** (el original persistido, su hash y su
  sello no cambian; documentar que la copia marcada no coincide con la huella y que para comparar se usa el original o la
  huella). Límite estricto por IP y por código, auditoría de cada descarga (IP truncada, sin datos personales extra),
  `Content-Disposition: attachment`, `no-store`.
- **Revocar/regenerar** el código (solo admin, motivo obligatorio, auditado): `POST /contracts/:id/verification-code/rotate`.
  El código anterior responde `revoked` sin datos del contrato. El PDF final ya sellado lleva el código viejo en su QR:
  documentar el efecto y proponer en el informe cómo emitir una constancia nueva sin romper el sello.

## Parte B — Colocación de firmas
- **Normalización del trazo** al recibir la imagen (después del saneado de T09b, antes de cifrar y hashear): recortar bordes
  transparentes con un pequeño margen, limitar tamaño. El hash de evidencia cubre la imagen ya normalizada.
- **Colocación** opcional en la firma: `placement { x, y, scale }` relativa a la casilla (x/y del centro en 0–1, scale en
  un rango acotado, p. ej. 0,5–1,5). Si no llega, encaje automático: centrada sobre la línea, máximo tamaño que cabe.
  El servidor **recorta (clamp)** para que la firma nunca salga de su casilla. Guardar la colocación con la firma e
  **incluirla en el payload de evidencia** (nueva versión del payload, compatible con las anteriores).
- PDF (T15) y `GET /contracts/:id` (para la vista previa del front) usan la misma colocación. El PDF final la incorpora.
- **Ajustar antes de la activación**: `PATCH /contracts/:id/signatures/me/placement` (solo el propio firmante, contrato aún
  no activo, su firma existente). Crea un registro de evidencia nuevo enlazado («colocación ajustada»), auditado; el anterior
  se conserva. **Volver a firmar** antes de la activación: `POST /contracts/:id/sign` de nuevo por el mismo firmante sustituye
  su firma vigente (la anterior queda en evidencia como sustituida); no altera el turno de los demás ni las firmas
  posteriores. Decidir y justificar en el informe si volver a firmar se permite cuando ya firmó alguien después (recomendado:
  sí, solo la propia firma, sin reiniciar a los demás, porque el documento firmado no cambia).
- Tras la activación: 409 en ajustar y volver a firmar. `can.adjustSignature` en el detalle del contrato para el firmante.
- Exponer en el detalle, para el firmante, la geometría de su casilla (página, índice de casilla, medidas relativas) para que
  el front dibuje la casilla real.

## Parte C — IP real del firmante (pedido del dueño)
En desarrollo la evidencia muestra `127.0.0.1` porque el firmante está en el mismo equipo. En producción/staging debe
registrarse la IP pública real: comprobar que `req.ip` con `TRUST_PROXY` (1 detrás del nginx de `deploy/`, 2 en staging
Instabox) da la IP del cliente, que una cabecera `X-Forwarded-For` enviada por el cliente **no** la falsea, normalizar
`::ffff:a.b.c.d` a IPv4, y añadir al arranque un aviso en el log si `NODE_ENV=production` y `TRUST_PROXY` no está definido.
Documentarlo en `docs/DEPLOY.md`. Pruebas con `inject` simulando el proxy.

## Parte D — Pendientes pequeños
- **Cédulas con formato** `000-0000000-0` en el PDF (casillas de firma, constancia) y en los valores de variables de cédula,
  venga como venga guardada (hoy sale `00112345673` junto a `001-1234567-3`).
- **H17** (de T14, reservado por T16 a T15 y no hecho): la búsqueda del catálogo construye `ILIKE` sin escapar; usar
  `escapeLike()` de T16. Y las entradas de H16 en catálogo/preview que T16 dejó pendientes.
- Documentos sin bloque de firmas (plantillas antiguas con líneas `____` escritas a mano): hoy se añaden casillas al final y
  se ven duplicadas. No intentar adivinar las líneas manuales; añadir en `GET /templates/:id` (o capabilities) un indicador
  `hasSignatureBlock` para que el front avise al editar la plantilla.

## Pruebas obligatorias
Código no adivinable y normalización; `legacy` sin descarga; huella coincide/no coincide (PDF alterado en 1 byte → false);
descarga con marca sin alterar el original ni su hash; rotación del código; límites; clamp de colocación (valores
extremos); ajuste y re-firma antes de activar, 409 después; nadie ajusta la firma de otro (admin incluido); cadena de
evidencia válida tras ajustes; PDF final con la firma en su casilla según la colocación; concurrencia de ajuste vs última
firma. Migración con el siguiente número libre. Suite completa en verde (Git Bash), typecheck y format.

## Entrega
Informe `docs/tasks/T18-verificacion-y-colocacion-de-firmas.REPORT.md` con el **contrato HTTP exacto** para el front
(rutas, cuerpos, respuestas, códigos de error, campos nuevos en el detalle).
