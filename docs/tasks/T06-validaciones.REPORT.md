# T06 — Informe de validaciones

## Resultado y alcance

Leídas primero las normas docs/CODE_STANDARDS.md. Implementadas reglas puras duplicadas en api/src/lib/validation/ y src/lib/validation/, con comentarios de sincronización y casos JSON idénticos. El test validation-sync compara fuentes normalizadas con Prettier y los casos. JSON no admite comentarios.

No se editaron componentes, archivos reservados a T08, migraciones ni el envío de correos. Los cambios concurrentes de T08 visibles en el diff general no pertenecen a T06. En fuentes compartidas de contratos solo se integraron validaciones/preparación de valores. No se imprimió api/.env ni se hizo commit.

## Reglas y decisiones

- Cédula: 11 dígitos, guiones y espacios admitidos, salida solo dígitos, Luhn y rechazo de todos iguales. CEDULA_EXCEPTIONS permanece vacío y documentado para documentos antiguos verificados por JCE.
- RNC: nueve dígitos y verificador DGII; admite guiones. validateTaxId identifica cédula o RNC.
- Teléfono: códigos 809/829/849, prefijo 1/+1 opcional y signos de formato; salida local de diez dígitos. Rechaza prefijos internacionales distintos de +1.
- Correo: trim, minúsculas, máximo 254, dominio por etiquetas y TLD de al menos dos letras; sin espacios ni puntos consecutivos en la parte local.
- Persona: Unicode NFC, espacios colapsados, 2–120 caracteres, letras y puntuación permitida. Nombre completo exige dos palabras con letras.
- Contraseña: 8–128, letra y número y lista corta de contraseñas comunes insensible a mayúsculas. No se recorta el secreto.
- Montos: decimal positivo de hasta 999999999999.99, salida con dos decimales; ambos estilos de separadores con agrupación correcta. Un separador seguido de tres cifras finales se interpreta como miles: 1.234 representa 1234.00. Normalización con strings y BigInt, nunca float.
- Fechas: calendario ISO real, año 0000 rechazado, comparación y rango estrictamente creciente.
- Texto libre: trim, límites configurables y rechazo de vacío/solo espacios.

Se conserva entrada numérica en montos de contratos/renovaciones por compatibilidad; se convierte a string antes de validar. Los formularios nuevos deben enviar strings para preservar precisión de extremo a extremo. El render monetario de valor_contrato también usa strings.

Los PATCH validan los campos recibidos. Editar un título no obliga a corregir nombres, documentos o teléfonos históricos de firmantes. No se migraron datos guardados.

## Aplicación en API

Prefijo /api/v1:

| Entrada | Campos/reglas |
| --- | --- |
| POST /auth/register | name completo, phone, cedula, email, password |
| POST /auth/login | email normalizado; esquema de contraseña existente para login |
| Recuperación/reenvío de confirmación | email mediante esquema compartido |
| POST /auth/reset-password | contraseña nueva |
| GET /auth/availability | email y cedula |
| POST /users | perfil, email y contraseña opcional de creación/invitación |
| PATCH /users/:id | campos presentes de perfil/email |
| GET /users/lookup | cedula validada y normalizada |
| PATCH /me | campos presentes del perfil |
| PATCH /me/password y /me/email | contraseña nueva y correo nuevo |
| POST/PATCH /contracts | value, fechas, rango, notas; firmantes: name/email/phone/cedula; duplicados después de normalizar |
| Acciones de contratos | comentarios, motivos y descripciones mediante texto libre |
| POST /renewals | proposedValue, proposedStartDate, proposedEndDate, rango y reason |
| POST /templates/preview y preparación de contratos | variables tipadas y campos heredados del cliente |

El enum actual de variables solo tiene text/date/number/select/textarea. Sin cambiar schema ni migraciones, el adaptador reconoce date y las variables heredadas cliente_cedula (cédula o RNC), cliente_telefono, cliente_email y valor_contrato. También soporta definiciones cedula/phone/email/money si se incorporan en el futuro. number genérico mantiene su comportamiento: también representa duración y cantidades.

Errores Zod y del parser de contratos: 400 con error.code VALIDATION_ERROR y error.details como lista de objetos field/message. Rutas anidadas con puntos: signatories.0.phone y variables.cliente_cedula.

## API pública para formularios

Importar desde src/lib/validation:

- ValidationResult<T>: unión { ok: true, value: T } o { ok: false, message: string }.
- validateCedula(input), validateRnc(input), validatePhoneDo(input), validateEmail(input), validatePassword(input), validateMoney(input), validateIsoDate(input): resultado con string normalizado.
- validateTaxId(input): resultado con { type: cedula o rnc, value: string }.
- validatePersonName(input, fullName = true): false permite nombre individual.
- validateFreeText(input, minimum = 1, maximum = 1000).
- validateDateRange(start, end): resultado con { start, end }.
- isAfter(date, reference): booleano; ambos argumentos deben ser fechas válidas.
- formatCedula(input), isValidCedula(input), formatPhoneDo(input). El último devuelve 809-555-1234. Los formateadores conservan la entrada inválida.
- CEDULA_EXCEPTIONS: conjunto de solo lectura vacío por defecto.

src/lib/format.ts reexporta formatCedula/isValidCedula para mantener imports existentes. Su formatPhone conserva la presentación anterior; el nuevo formato solicitado se expone como formatPhoneDo.

api/src/lib/validation/zod.ts exporta zCedula, zRnc, zTaxId, zPhoneDo, zEmail, zPersonName, zPassword, zMoney, zMoneyInput, zIsoDate, zFreeText y validated.

## Seed y fixtures

Usuarios nuevos del seed: nombre completo, teléfono RD y cédulas sintéticas con verificador calculado: 00100000017, 00100000025, 00100000033 y 00100000041. Se reemplazó el fallback DEMO-001 de contratos por una cédula válida. Los usuarios existentes no se actualizan. No se ejecutó el seed sobre desarrollo.

Helpers de test generan cédulas válidas mediante secuencia/checksum. Se ajustaron fixtures de registro, perfil y permisos que enviaban documentos arbitrarios, teléfono vacío o nombres de una sola palabra.

## Verificación y límites

- Prettier --write/--check sobre lista explícita T06: OK. No se ejecutó npm run format global porque escribe también en archivos reservados a T08. npm run format:check de API sí se ejecutó y detectó archivos ajenos en edición, incluidos env/schema/jobs/mail/test/database.ts.
- API npm run typecheck y npm run build: OK.
- API: 269 tests unitarios pasan en validation, validation-sync, validation-schemas, contracts-unit y auth-utils. Incluyen 65 casos/helpers comunes, adaptadores Zod, rango de renovación y variables tipadas/heredadas.
- Tests HTTP añadidos: registro con cédula inválida y contrato con teléfono inválido. Ambos se observaron pasando en la ejecución completa sobre simaud_test, con detalle por campo.
- Añadida regresión para edición con firmantes históricos. La ejecución acotada no pudo verificarla: falló la preparación por datos duplicados concurrentes.
- npm test completo de API NO queda certificado en verde. Primera ejecución: 288 aprobados y 37 fallidos en 325 tests, con interferencias de ejecuciones simultáneas en simaud_test (duplicados, claves foráneas y sesiones eliminadas). La siguiente confirmó ambos rechazos HTTP y reveló dos fixtures adicionales de nombres completos ya corregidos. Las repeticiones acotadas también encontraron interferencias de setup/sesiones. No se atribuyen todos los fallos globales a T06 ni se presentan como éxito.
- La segunda ejecución completa seguía activa después de imprimir contratos. taskkill fue rechazado por el sistema con acceso denegado; después se envió terminación mediante el handle del proceso hijo. No se puede certificar la terminación de todos sus descendientes.
- Web npm run test: OK, 94 tests. Web npm run build: OK.
- Web tsc --noEmit -p tsconfig.app.json, mediante script equivalente typecheck: 132 errores fuera de src/lib; ninguno en src/lib. No se tocaron componentes para corregirlos.
- API npm audit: falló la petición al endpoint del registro npm. No se modificaron dependencias.

## Pendientes para revisión

Repetir suite API con acceso exclusivo a simaud_test cuando termine T08; repetir format:check global y audit. Para enviar montos como strings desde TypeScript, Claude debe ampliar ContractInput.value en los tipos del cliente al conectar formularios; ese archivo está fuera del alcance de edición T06. No se necesita cambiar archivos reservados a T08 para las reglas implementadas. No se amplió el enum de tipos de plantilla.
