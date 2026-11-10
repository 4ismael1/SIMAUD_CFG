# T06 — Validaciones de datos (cédula JCE, RNC, teléfono, correo, nombres, fechas, montos)

**Asignado a:** Codex · **Revisa:** Claude · **Depende de:** T03b terminado.
Alcance: `api/src/**`, `api/test/**`, `src/lib/validation/**` (nuevo), `src/lib/format.ts`, `src/lib/**/*.test.ts`, `docs/tasks/T06*`.
**No toques componentes de UI** (`src/ui`, `src/app`, `src/features`): Claude conecta las validaciones a los formularios.
Lee `docs/CODE_STANDARDS.md` primero. Código legible (nada compactado).

## Objetivo
Una única regla por tipo de dato, idéntica en servidor y cliente, con mensajes en español claros.
El servidor es la autoridad (el cliente solo adelanta el error). Hoy `src/lib/format.ts` ya tiene `isValidCedula`/`formatCedula`: revísalos y muévelos al módulo nuevo (deja reexportaciones si algo los importa).

## 1. Reglas (funciones puras, sin dependencias)
Crea `api/src/lib/validation/` y `src/lib/validation/` con **el mismo contenido lógico** (dos copias, el monorepo no comparte paquete; añade al inicio de cada archivo un comentario «mantener sincronizado con …» y un test que compare los mismos casos en ambos lados usando una tabla de casos común, p. ej. `cases.json` duplicado).

- **Cédula dominicana (JCE)**: 11 dígitos, admite entrada con o sin guiones (`000-0000000-0`), normaliza a solo dígitos. Dígito verificador: algoritmo de Luhn con pesos alternos 1,2 sobre los 10 primeros dígitos (si el producto ≥ 10 se suman sus cifras; verificador = (10 − suma mod 10) mod 10). Rechaza todo-iguales (`00000000000`, `11111111111`…).
  Existen cédulas antiguas emitidas por la JCE que **no** cumplen el algoritmo: soporta una lista de excepciones (`CEDULA_EXCEPTIONS`, conjunto vacío por defecto, en un archivo propio documentado) — no inventes números.
- **RNC (DGII)**: 9 dígitos; pesos `7,9,8,6,5,4,3,2` sobre los 8 primeros, resto = suma mod 11; verificador: resto 0 → 2, resto 1 → 1, si no 11 − resto. Admite guiones (`1-01-00000-0`). Un campo «documento» puede aceptar cédula **o** RNC (función `validateTaxId` que dice cuál es).
- **Teléfono RD**: 10 dígitos, código de área 809, 829 u 849; acepta `+1`, `1`, espacios, guiones y paréntesis; normaliza a `8095551234`; formatea `809-555-1234`.
- **Correo**: recortar, minúsculas, longitud ≤ 254, regla razonable (local@dominio.tld, sin espacios, TLD ≥ 2). No uses una regex monstruosa.
- **Nombre de persona**: 2–120 caracteres tras recortar y colapsar espacios; letras (incluye tildes, ñ, ü), espacios, apóstrofo, guion y punto; al menos dos palabras para «nombre completo».
- **Contraseña**: la regla actual del API (≥ 8, letra y número), máx. 128; añade lista corta de contraseñas obviamente débiles (`12345678`, `password1`, `simaud123`…).
- **Montos**: string decimal con hasta 2 decimales, > 0, ≤ 999 999 999 999,99; acepta `87500`, `87500.5`, `87,500.50` y `87.500,50` (detecta el separador) y devuelve string normalizado `87500.50`. Nunca `float`.
- **Fechas**: ISO `YYYY-MM-DD` válidas (rechaza `2026-02-30`); helpers `isAfter`, rango inicio < fin.
- **Texto libre** (motivos, comentarios): recortar; mínimo/máximo configurable; rechazar solo-espacios.

Cada validador devuelve `{ ok: true, value /* normalizado */ } | { ok: false, message }` con mensajes en español, p. ej. «La cédula no es válida: revisa el dígito verificador.», «El teléfono debe empezar por 809, 829 u 849.».
Expón también helpers Zod en la API (`zCedula`, `zRnc`, `zPhoneDo`, `zEmail`, `zPersonName`, `zMoney`, `zIsoDate`) que usan estas funciones y transforman al valor normalizado.

## 2. Aplicarlas en la API
Sustituye las validaciones ad hoc en los esquemas existentes: registro/invitación/perfil de usuarios (`auth`, `users`, `me`), búsqueda de usuario por cédula, firmantes y datos de contratos (cédula/RNC del cliente, teléfono, correo, valor, fechas), renovaciones (fechas y valor). Las variables de plantilla tipadas (si existe tipo `cedula`, `phone`, `money`, `date`, `email`) deben validarse con la misma regla.
- Errores 400 con el formato de error ya existente y el detalle por campo (revisa `src/lib/errors.ts`).
- **Revisa el seed** (`src/db/seed*.ts`): las cédulas/teléfonos de ejemplo deben pasar las reglas nuevas (genera cédulas con dígito verificador correcto).
- Los datos ya guardados no se migran; solo se valida lo que entra.

## 3. Tests
- Tablas de casos válidos/ inválidos para cada regla (incluye cédulas con guiones, con espacios, con dígito incorrecto, todo-ceros; RNC válido/inválido; teléfonos con +1 y con código de área no permitido; montos con ambos separadores; 29 de febrero bisiesto/no bisiesto).
- Tests de API para al menos: registro con cédula inválida → 400 con mensaje; contrato con teléfono inválido → 400.
- Frontend: `npm run test` (Vitest) con los mismos casos.

## 4. Verificación final
API: `npm run format && npm run format:check && npm run typecheck && npm test && npm audit`.
Web (raíz): `npm run test` y `npx tsc --noEmit -p tsconfig.app.json` sin errores nuevos en `src/lib`.

## Informe
`docs/tasks/T06-validaciones.REPORT.md`: reglas implementadas, dónde se aplican (lista de endpoints/campos), API pública de `src/lib/validation` para que Claude la conecte en los formularios, cambios en seed, tests. No hagas git commit.
