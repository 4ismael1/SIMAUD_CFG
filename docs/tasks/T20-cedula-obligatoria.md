# T20 — Cédula obligatoria de todo firmante

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md` y los informes T17 y T19.
Solo `api/`. Sin commit, sin secretos, sin leer `api/.env`. BD de pruebas local heredada (`DATABASE_URL_TEST`).

## Decisión del dueño (10 nov 2026)
La cédula es la identidad legal de quien firma: **nunca es opcional** en un firmante de contrato (el front ya la exige).

## Alcance
- `POST /contracts` y `PATCH /contracts/:id` (cuando se envían `signatories`): `cedula` obligatoria y válida para **todo**
  firmante, incluidos testigos. 400 `VALIDATION_ERROR` con `details` por campo (`signatories.<i>.cedula`).
- Separar el tipo de **entrada HTTP** (cédula obligatoria) del tipo **interno** que usan copias de enmiendas/renovaciones y
  datos históricos (pueden no tenerla): no romper la lectura, verificación ni copia de contratos antiguos.
- Enmiendas y renovaciones creadas desde un contrato con algún firmante sin cédula: se crean igual (borrador), pero **no se
  pueden enviar a aprobación** (`POST /contracts/:id/submit` → 409 con mensaje claro «Falta la cédula de …») hasta completarla
  con PATCH. Lo mismo para cualquier borrador antiguo sin cédula.
- `can.submit` false en ese caso y un campo informativo en el detalle (`missingCedula: string[]` con los nombres o IDs de
  firmante) para que el front lo muestre.
- Ajustar los fixtures de pruebas que creaban firmantes sin cédula (generar cédulas válidas sintéticas) sin debilitar pruebas.
- Pruebas: alta sin cédula → 400; testigo sin cédula → 400; PATCH que quita la cédula → 400; enmienda de contrato antiguo sin
  cédula → borrador creado, submit 409 hasta completar, luego OK; lectura/verificación de contratos antiguos intacta.

## Entrega
Typecheck, format:check y suite completa en verde. Informe `docs/tasks/T20-cedula-obligatoria.REPORT.md` con el contrato HTTP.
