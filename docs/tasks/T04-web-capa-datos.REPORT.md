# T04 — Web: capa de datos

Fecha: 2026-11-09 (America/New_York).

## Estado y alcance

Implementación de T04 terminada dentro de su alcance. Se leyeron CODE_STANDARDS, api/README y las especificaciones T01–T03 antes de implementar. No se modificaron api/, src/components/, App.tsx, el AuthContext anterior ni estilos. No se instalaron dependencias ni se modificó package-lock.json. No se hizo staging ni commit. El repositorio contenía cambios previos y recibió cambios simultáneos de otros agentes; se conservaron.

Archivos nuevos: src/lib/api/** (cliente, sesión en memoria, tipos, mapas, claves, SSE y trece dominios de hooks), src/lib/auth/**, src/lib/format.ts, src/lib/query.ts, pruebas y vitest.config.ts. package.json solo recibió los cuatro scripts autorizados; vite.config.ts solo recibió server.proxy de /api a http://localhost:3000, conservando el plugin simaud-ui-mock.

## Validación

| Comprobación | Resultado |
| --- | --- |
| npm run test | 29 pruebas aprobadas en 8 archivos; Vitest + jsdom, MSW 3 y Testing Library. |
| npm run format | Correcto; limitado explícitamente a archivos de la capa nueva, pruebas y vitest.config.ts. |
| npm run format:check | Correcto. No reformatea componentes, estilos ni configuración Vite existente. |
| npm run typecheck (tsc --noEmit -p tsconfig.app.json) | Cero errores en los archivos de T04, incluidas las pruebas. La comprobación global termina con código 2 por errores externos al alcance. La última ejecución contó 193 diagnósticos; el número cambió durante el trabajo paralelo. |
| npm run build | Correcto. Persiste el aviso de Vite sobre __dirname en el plugin preexistente; no se modificó por el alcance estricto. |
| git diff --check sobre el alcance | Correcto. |

Ejemplos de diagnósticos externos: user sin usar en src/App.tsx, OldLoginForm sin usar en src/components/auth/LoginForm.tsx y errores del modelo anterior en componentes de contratos. No se intenta corregirlos desde T04.

La terminal estándar falló al crear el proceso con setup refresh had errors. Se utilizó el runtime de Node disponible para acceder al workspace y lanzar los scripts reales de npm mediante cmd.exe, sin cambiar sus comandos ni omitir verificaciones.

## Entrega y decisiones

- apiFetch usa /api/v1, cookies include, Bearer en memoria, query tipada, AbortSignal, JSON y multipart sin fijar el boundary. ApiError conserva status, code y details; los errores de red muestran un mensaje español. AbortError conserva su identidad.
- El refresh comparte una promesa entre peticiones, reintenta REFRESH_RACE una vez tras 300 ms y cada petición original se reintenta como máximo una vez. Se evita restaurar un token tardío después de logout. Login y demás endpoints auth no generan bucles de refresh ante credenciales inválidas.
- BroadcastChannel simaud-auth comunica login, logout, renovación y expiración sin persistir tokens en localStorage/sessionStorage. Las notificaciones recibidas no se retransmiten.
- apiDownload comparte autenticación/refresh y extrae filename o filename* UTF-8 de Content-Disposition. Devuelve Blob y nombre; la UI decide cuándo guardar o abrir el archivo.
- Los tipos están divididos por responsabilidad y reexportados desde types.ts. Se contrastaron con las respuestas implementadas de T01/T02 y el avance de T03: catálogos y cola como arrays; contratos, auditoría, renovaciones y notificaciones paginados; valores monetarios de respuesta como strings.
- Las claves están centralizadas. Las mutaciones actualizan o invalidan recursos relacionados, conservando detalles de otros contratos y dominios ajenos. Los listados paginados mantienen datos anteriores. Se incluyen conteos de contratos y no leídas, versiones/auditoría, preferencias, exports, firmas multipart y jobs.
- createQueryClient utiliza staleTime de 30 segundos y hasta dos reintentos solo para NETWORK/5xx; las mutaciones no se reintentan. Expiración, logout y login limpian consultas y mutaciones. disposeSessionListener permite liberar la suscripción si se desecha el cliente.
- useServerEvents obtiene un ticket de un solo uso, crea EventSource con cookies y reconecta con backoff de 1 a 30 segundos, obteniendo un ticket nuevo cada vez. Actualiza no leídas, inserta notificaciones de primera página respetando los filtros y deduplicación, e invalida listas. role-changed invalida me y refresca la sesión. Logout, expiración y desmontaje cierran la conexión y cancelan peticiones y temporizadores.
- AuthProvider/useAuth nuevos restauran mediante refresh y me, exponen loading/authenticated/anonymous, user, login, logout, register y hasRole. Los guards sin estilos aceptan fallback/children y pueden renderizar Outlet de React Router 7. No se conectaron a App ni al contexto anterior.
- Dinero: agrupación y coma decimal solicitadas por T04; los strings se convierten a centavos BigInt y se redondean a dos decimales sin pasar por float. Las abreviaturas mantienen esa precisión. Fechas y horas usan America/Santo_Domingo; las fechas ISO sin hora conservan su día. daysUntil y formatRelative admiten reloj de referencia para pruebas deterministas.
- Cédula: formato y algoritmo de dígito verificador ponderado 1/2, con rechazo de ceros repetidos y entradas mal formadas. La validación confirma la forma y el checksum; no consulta el registro civil ni certifica que una cédula esté emitida.
- MSW instalado es versión 3: se utiliza onUnhandledFrame en lugar de onUnhandledRequest. No se añadieron dependencias.

## Cobertura relevante

Tres 401 simultáneos producen un solo refresh; REFRESH_RACE programa el reintento de 300 ms con reloj controlado; refresh fallido comunica expiración; se verifican errores HTTP/red, multipart, cookies, query, 204, descarga UTF-8, abort y logout durante refresh. También invalidaciones al aprobar, política de reintentos, limpieza global de caché, restauración/login/logout/registro, roles y Outlet, mensajes entre pestañas, SSE/tickets/backoff/cierre y todos los formateadores (precisión decimal, fechas, relativos, cédulas válidas/inválidas y teléfonos).

## Integración pendiente y discrepancias detectadas

1. **SSE:** T04 exige EventSource('/api/v1/events?ticket=...') y así se implementó y probó. En la última lectura, api/src/modules/notifications/routes.ts de T03 todavía extraía el ticket del parámetro token. El agente de T03 debe admitir ticket o acordar el cambio del contrato antes de conectar SSE contra ese servidor. El valor es siempre el ticket efímero, nunca el JWT. No se modificó api/ ni se introdujo un fallback silencioso con dos nombres de parámetro.
2. **Jobs:** el endpoint de historial en curso usa SQL crudo y todavía expone las columnas internas de lastRun con nombres snake_case. Los tipos públicos de T04 siguen la convención camelCase de la API (startedAt/finishedAt). T03 debe normalizar esa respuesta antes de integrar la pantalla.
3. **Dashboard:** los payloads son la unión de las cuatro formas reales y no inventan un campo role ausente en el servidor. Solo el dashboard admin devuelve métricas con previous/trend; supervisor y gestor exponen sus KPIs escalares conforme al avance de T03. El rol se obtiene de useAuth; no se manda por query. Las filas resumidas tienen tipos propios y no se presentan como contratos completos.
4. **Conexión UI:** Claude debe montar un QueryClientProvider con createQueryClient, montar el nuevo AuthProvider y llamar useServerEvents una vez dentro del árbol autenticado. Los hooks importan desde src/lib/api/hooks/<dominio>; sesión/guards desde src/lib/auth. La integración de pantallas y la corrección de sus errores previos quedan fuera del alcance autorizado.

No se tomaron atajos de tipado (any, ts-ignore) ni se tocaron archivos ajenos para poner en verde el typecheck global. Las pruebas SSE usan una implementación controlada de EventSource: no se afirma una comprobación de extremo a extremo contra el backend en construcción.
