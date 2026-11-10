# T05 — Informe de despliegue

Fecha: 9 de noviembre de 2026.

## Resultado y alcance

Infraestructura y guía entregadas dentro de los archivos autorizados. **El despliegue productivo requiere resolver los pendientes de API/web descritos abajo y validar las imágenes en Docker.** No se ha desplegado ningún servicio, descargado ninguna imagen ni hecho git commit. No se leyó ni imprimió api/.env. Se conservaron los cambios del otro agente.

## Archivos creados

- api/Dockerfile y api/.dockerignore: etapas deps, build, production-deps y runtime; Node 24 Alpine; npm ci con lockfile y solo dependencias productivas en runtime; usuario node; volumen /app/storage; healthcheck de /api/v1/health que comprueba HTTP y status/db. Incluye drizzle y las fuentes locales de api/assets para ejecutar el migrador y generar PDF sin Internet.
- Dockerfile.web y .dockerignore: build Vite, exclusión del entorno local y modo mock desactivado; nginx sirve los recursos compilados. Los contextos usan listas de inclusión para evitar secretos y uploads.
- deploy/nginx/: configuración principal, plantilla TLS y cabeceras compartidas. Redirección 80 a 443, certificados montados, fallback SPA, gzip, caché anual de assets y no-cache del HTML; límite de 3 MiB para permitir el sobre multipart de archivos de 2 MiB. CSP estricta, HSTS y demás cabeceras solicitadas. Proxy mantiene el prefijo /api/; SSE exacto /api/v1/events sin buffering/gzip y timeout de una hora. La resolución DNS del upstream se renueva al reemplazar la API.
- docker-compose.prod.yml: db, api, web, migrate con perfil tools y backup. PostgreSQL 17, dependencias healthy, volúmenes persistentes, redes internas database/proxy y salida independiente para SMTP. Solo web publica puertos. TRUST_PROXY=1 y JOBS_ENABLED=true en API; migrate desactiva ambos. Reinicio unless-stopped salvo el migrador de una ejecución; logs limitados por servicio.
- deploy/backup/: imagen con cliente PostgreSQL 17 y crond; copia diaria 02:00 UTC con pg_dump -Fc, tar completo de storage y SHA256SUMS. Conserva siete juegos diarios y cuatro semanales; solo el primer backup del domingo cuenta como semanal. Publicación del juego mediante renombrado tras completar ambos archivos, exclusión mutua y limpieza de parciales ante fallos.
- deploy/backup/restore.sh y deploy/restore.compose.yml: confirmación explícita del nombre de BD, validación de checksums, storage vacío, restauración SQL transaccional y conservación de uid/gid de archivos. Override temporal para permitir escritura de storage y leer backups sin modificarlos.
- deploy/.env.prod.example: variables de infraestructura y API, placeholders y generación de secretos. api/.env.example ya contiene las variables de la API y no necesitó cambios.
- docs/DEPLOY.md: instalación, empaquetado offline, migraciones, limitación del primer administrador, actualización, copias, recuperación en proyecto y volúmenes nuevos, certificados, logs y diagnóstico.

## Decisiones y límites operativos

- No ejecutar migraciones al arrancar ni reiniciar la API. El comando productivo es node dist/db/migrate.js; npm run db:migrate requiere tsx de desarrollo y no se usa en runtime.
- Mantener DATABASE_URL_TEST como URL inerte porque el validador actual la exige incluso en producción; no crear una BD de pruebas ni ejecutar tests en producción.
- Sobrescribir X-Forwarded-For desde nginx en vez de aceptar el valor entrante. TRUST_PROXY=1 supone un único proxy antes de Fastify.
- No registrar query ni Referer en access logs; suprimir el error_log del endpoint SSE para evitar tickets en mensajes de upstream. Conservar errores de otras rutas para diagnóstico.
- Respaldos online: PostgreSQL mantiene la coherencia del dump, pero BD y archivos no forman una instantánea común mientras haya escrituras. La guía exige mantenimiento con web/API/jobs parados para obtener un juego conjunto consistente antes de una actualización. TI debe vigilar antigüedad de copias, capacidad, bloqueos residuales y guardar copias cifradas fuera del host.
- .env.prod no está ignorado por el .gitignore actual. No se modificó ese archivo por estar fuera del alcance; la guía indica exclusiones locales en .git/info/exclude o una instalación sin Git.
- No se ejecutó npm run format global: reescribe código de otros agentes. Se aplicó Prettier solo a los YAML y documentos entregados, y se comprobaron sin escribir los conjuntos de código establecidos por los scripts de formato.

## Verificación realizada

| Comprobación                                                    | Resultado                                                                                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| sh -n de backup.sh y restore.sh                                 | Correcto con Git sh local.                                                                                                                                                                                                                       |
| Prettier de Compose, override y DEPLOY.md                       | Correcto; valida también el parseo YAML, no la semántica específica de Compose.                                                                                                                                                                  |
| Formato del código API y conjunto web definido por format:check | Correcto, sin reescribir archivos.                                                                                                                                                                                                               |
| Typecheck API, tsc --noEmit                                     | Correcto.                                                                                                                                                                                                                                        |
| Typecheck web, tsc --noEmit -p tsconfig.app.json                | Falló con 132 diagnósticos en código fuera del alcance: símbolos sin usar, tipos heredados de contratos, campos ausentes y otros. Ejemplos: src/App.tsx, src/components/contracts/ContractManagement.tsx y ContractModal.tsx. No se modificaron. |
| Tests web, Vitest                                               | 29 tests en 8 archivos correctos.                                                                                                                                                                                                                |
| Build API, tsc -p tsconfig.build.json                           | Correcto; salida temporal dentro de deploy/.verification, eliminada tras comprobarla.                                                                                                                                                            |
| Build web, Vite                                                 | Correcto; salida temporal dentro de deploy/.verification, eliminada. Aviso existente sobre __dirname de vite.config.ts para una futura versión del config loader.                                                                                |
| Prueba aislada del backup                                       | Correcta: ocho ejecuciones con fechas controladas y pg_dump simulado; retención 7/4, semanal única, checksum, tar con archivo real, rechazo de duplicado y limpieza tras fallo del dump. No sustituye una restauración real de PostgreSQL.       |
| Saltos LF, salto final y ausencia de espacios finales           | Correcto en todos los archivos de despliegue.                                                                                                                                                                                                    |

La prueba aislada usó copias temporales de los scripts con rutas bajo deploy/.verification, sin tocar /backups ni storage real. Todos los artefactos temporales fueron eliminados.

## No verificable aquí

- Docker y nginx no están instalados/disponibles en PATH. No se pudo ejecutar docker compose config, construir/arrancar imágenes, comprobar módulos de nginx con nginx -t, validar TLS/SSE/cabeceras en vivo ni restaurar un dump PostgreSQL real. No se intentó descargar imágenes. La guía incluye los comandos para TI.
- No se ejecutaron tests de API: requieren PostgreSQL de tests compartido y truncan datos; no hay PostgreSQL aislado disponible y otra tarea trabaja en paralelo. El typecheck y build API sí se ejecutaron sin cargar api/.env.
- No se comprobó entrega SMTP, renovación real de certificados, permisos de volúmenes Linux ni compatibilidad visual de la CSP en navegador. Son comprobaciones de aceptación antes de publicar.

## Cambios necesarios fuera del alcance

1. **Bloqueante — API:** api/src/server.ts fija host: 127.0.0.1. Debe admitir 0.0.0.0 en el contenedor, idealmente mediante HOST validado en api/src/config/env.ts. Sin ese cambio, el healthcheck interno puede pasar y nginx responderá 502. No se alteró el código ni se añadió un envoltorio que esconda ese problema.
2. **Primer administrador:** el único seed actual (api/src/db/seed.ts y seed-contracts.ts) crea cuatro usuarios demo, catálogos y contratos de ejemplo. Falta un comando seguro e idempotente para crear únicamente el primer administrador institucional; no se recomienda ejecutar el seed productivamente. La guía detiene el alta inicial en ese paso hasta que exista.
3. **Web sin Internet:** src/index.css aún importa Google Fonts. Autoalojar Geist, Geist Mono y Source Serif 4 con sus licencias y sustituir esa importación en src/. La CSP mantiene font-src/style-src self y permite las fuentes de reserva mientras no se haga ese cambio.
4. **CSP compatible:** revisar estilos inline de librerías y HTML de documentos, adaptar componentes en src/ cuando corresponda y probar firmas, gráficos y exportaciones. No se debilitó la política con unsafe-inline. La compatibilidad completa queda pendiente de esa prueba.
5. **Typecheck web:** corregir los 132 diagnósticos detectados en la ejecución global antes de declarar todos los checks del proyecto en verde; corresponden al trabajo de frontend fuera de esta tarea.
