# T16 — Correcciones de la auditoría T14 (grupos 3, 4 y 6)

**Asignado a:** Codex · **Revisa:** Claude. Lee `docs/PRINCIPIOS.md`, `docs/CODE_STANDARDS.md` y
**`docs/tasks/T14-auditoria-global.REPORT.md`** (hallazgos y «Tareas propuestas»), más los informes T10, T12a, T12b y T13.

Corrige los hallazgos **H06, H07, H08, H09, H10, H11, H12, H16, H17 y H18** tal como los describe el informe
(escenario, corrección propuesta y pruebas faltantes de cada uno), y **H02 con la política decidida por el dueño**:
- **El admin SÍ puede aprobar sus propios contratos y renovaciones** (decisión del 10 nov 2026). Debe quedar
  registrado en la auditoría como autoaprobación (acción distinguible, p. ej. `approved_own`).
- Supervisor y gestor **no** pueden aprobar ni devolver lo que crearon o solicitaron, **incluidas las renovaciones**
  que ellos solicitaron. La autoría/solicitud original no cambia aunque se reasigne el gestor o cambie el rol.
- `can.approve`/`can.reject` del detalle aplican la misma regla. Tests: admin sobre lo suyo (permitido y auditado),
  supervisor y gestor sobre su contrato y su renovación (403), reasignación y cambio de rol entre solicitud y revisión.

**No** toques H01, H03, H04, H05, H13, H14 ni H15: dependen de otras decisiones o de otra tarea.

## Coordinación (importante)
- En paralelo trabaja **T15** (plantillas `rich-v2`, PDF, firmas estampadas): es dueño de `api/src/lib/rich-doc/**`,
  `api/src/lib/pdf.ts`, `api/src/modules/contracts/{pdf,pdf-attestation,catalog}.ts` y la plantilla/preview.
  No los edites. Si un hallazgo tuyo cae ahí (p. ej. H17 en el catálogo), déjalo anotado en el informe.
- H08 (orden de bloqueos firma/renovación) toca `contracts/signatures.ts` y `renewals/**`: cambia solo el orden de
  bloqueos y añade la prueba; no reestructures la generación del PDF final.
- H18: refactor solo donde corriges otro hallazgo; sin reescrituras masivas.
- Contratos HTTP: no cambies formas de respuesta salvo H11 (importes exactos como string decimal en reportes y
  exportaciones nuevas). Documenta en el informe cada cambio visible para el front.
- Migración nueva solo si hace falta (índices de H10): número **0014** (T15 reserva la 0013).

## Entrega
Pruebas deterministas por hallazgo (barreras, relojes inyectados, sin sleeps). Suite completa en verde al final
(`npm run typecheck && npm run format:check && npm test && npm audit`, Git Bash; BD `simaud_test3`). No hagas
git commit. No imprimas secretos. Termina con `docs/tasks/T16-correcciones-auditoria.REPORT.md` (qué se corrigió,
cómo se probó, cambios de contrato para el front, lo que quedó fuera).
