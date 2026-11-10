# Normas de código — SIMAUD

Obligatorias para todo el código del proyecto (API y web). Claude rechaza en revisión lo que no las cumpla.

## Legibilidad
- **Una sentencia por línea.** Nada de encadenar varias operaciones con `;` o `&&` en una sola línea para "ahorrar espacio".
- **Nombres descriptivos** en inglés para código (`contract`, `signatory`, `currentUser`), nunca de una letra salvo índices de bucle cortos. Textos para el usuario, en español.
- **Funciones pequeñas** (orientativo ≤ 40 líneas) con una sola responsabilidad y nombre que diga qué hacen. Si necesitas un comentario para explicar un bloque, extráelo a una función con ese nombre.
- **Archivos acotados** (orientativo ≤ 300 líneas). Si crece, divide por responsabilidad (`routes.ts`, `service.ts`, `queries.ts`, `permissions.ts`…).
- **Prettier** obligatorio (`npm run format`); el formato no se discute en revisión.
- Comentarios solo para el **porqué** (reglas de negocio, decisiones no obvias), nunca para repetir el qué.

## Tipos y errores
- TypeScript estricto. Prohibido `any` (usa `unknown` y estrecha). Nada de `@ts-ignore`; `@ts-expect-error` solo con motivo.
- Errores con la clase/forma común del proyecto (`ApiError` en la API, `ApiError` del cliente en la web). Mensajes al usuario en español, claros y accionables.
- Nunca tragarse un error en silencio (`catch {}` vacío). Si se ignora a propósito, comentario con el motivo.

## Estructura
- **API:** `routes` (HTTP: validar entrada, llamar al servicio, dar forma a la respuesta) → `service` (reglas de negocio, transacciones) → `db`/queries. Nada de SQL ni reglas de negocio en las rutas.
- **Web:** componentes de UI sin llamadas `fetch` directas; los datos llegan por hooks de `src/lib/api`. Lógica de formato en `src/lib/format.ts`, no repetida en componentes.
- Sin duplicación: si algo aparece dos veces, se extrae.
- Sin código muerto, sin `console.log` olvidados, sin TODO sin dueño.

## Tests
- Cada regla de negocio o de permisos tiene su test. Los tests describen el comportamiento en su nombre (`"un gestor no ve contratos ajenos"`).
- Tests deterministas: nada de esperas por tiempo; fechas inyectadas.

## Antes de entregar
`format:check`, `typecheck`, `test` y `build` en verde. El REPORT lista decisiones, dudas y cualquier atajo tomado.
