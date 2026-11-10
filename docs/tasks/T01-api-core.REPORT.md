# T01 — API core: informe de implementación

Fecha: 2026-11-09 (America/New_York).

## Estado

Implementación terminada y validación funcional aprobada. Los criterios 1, 2 y 4 están comprobados. El criterio 3 queda parcialmente bloqueado por el entorno: `npm audit --offline` informa **0 vulnerabilidades**, pero la consulta online del endpoint de auditoría npm falla por conexión denegada. No se afirma que la auditoría online haya pasado.

Cambios realizados exclusivamente dentro de `api/` y este informe en `docs/tasks/`. No se modificaron el frontend, los paquetes raíz, Supabase ni otras tareas. Se conservaron los cambios preexistentes del repositorio. No se realizó git commit ni staging. `api/.env` no se imprimió, no se modificó y está excluido de Git.

## Entrega

- API independiente con Node 24, TypeScript estricto, ESM, Fastify 5 y los plugins de cookie, CORS, helmet, rate limit y multipart.
- Configuración validada con Zod; `.env.example`, scripts de desarrollo/compilación/BD y `package-lock.json`.
- PostgreSQL mediante pg y Drizzle. Las **14 tablas**, los enums, restricciones, claves foráneas e índices están definidos en `src/db/schema.ts`. Migración inicial y snapshot generados en `drizzle/`.
- Autenticación completa: registro siempre como user, disponibilidad, confirmación y reenvío, login, refresh rotado por familia, logout/logout-all y recuperación/restablecimiento de contraseña.
- Argon2id para contraseñas; JWT HS256 de 15 minutos; tokens opacos aleatorios de 32 bytes guardados únicamente como SHA-256.
- Cookie refresh httpOnly/SameSite=Lax, Secure en producción y limitada a `/api/v1/auth`.
- Plugin que relee rol, actividad y borrado desde PostgreSQL en cada petición protegida.
- Perfil, cambio de contraseña y email, avatares JPEG/PNG/WebP de hasta 2 MiB con validación de magic bytes, almacenamiento aleatorio, sustitución y borrado.
- CRUD administrativo, consulta paginada y lookup restringido. Protección frente a eliminación, desactivación o degradación propia y frente a la pérdida del último admin activo.
- Auditoría estructurada de usuarios y helper transaccional `lib/audit.ts` para el dominio de contratos.
- Seed idempotente con cuatro usuarios confirmados, las diez variables y la plantilla de las migraciones de Supabase.
- Documentación de configuración, scripts y contrato HTTP en [api/README.md](../../api/README.md).

## Validación ejecutada

Runtime utilizado: Node **24.16.0**.

| Comprobación | Resultado |
| --- | --- |
| npm install | Correcto; dependencias y lockfile sincronizados. Se utilizaron flags de caché y límites de reintento/timeout durante el diagnóstico de red. |
| npm run db:generate | Correcto; al finalizar no detecta diferencias pendientes. |
| npm run db:migrate | Correcto contra simaud_dev mediante el túnel existente. |
| npm run db:seed | Correcto, ejecutado dos veces; la segunda no vuelve a imprimir contraseña ni duplica datos. |
| npm test | **30 pruebas aprobadas, 3 archivos**, contra DATABASE_URL_TEST/simaud_test. |
| npm run typecheck | Correcto, cero errores. |
| npm run build | Correcto; build con noEmitOnError. |
| npm run dev | Arranca en http://127.0.0.1:3000. |
| GET /api/v1/health por HTTP real | **200**, cuerpo exacto `{"status":"ok","db":"ok"}`. Se detuvo el servidor de prueba después de comprobarlo. |
| npm audit --offline | **0 vulnerabilidades**. |
| npm audit online | **Bloqueado por red**: falla la petición a `https://registry.npmjs.org/-/npm/v1/security/advisories/bulk`; los intentos de conexión al registro produjeron EACCES. |

La herramienta de terminal estándar falló al iniciar con `setup refresh had errors`. Se utilizó el runtime de Node disponible para leer/escribir los archivos y lanzar los mismos ejecutables/scripts. Inicialmente faltaban dependencias y no había acceso al registro; la caché local permitió avanzar con migraciones y pruebas de BD. Posteriormente quedaron disponibles las dependencias completas y se verificaron instalación, seed, suite HTTP, tipos, build y arranque real.

La contraseña inicial generada para el seed se imprimió una sola vez por el propio script. No se reproduce aquí y no se guardó en archivos.

### Cobertura de pruebas

- Registro ignora role:admin; normalización y unicidad de email/cédula; disponibilidad.
- Login sin confirmar, confirmación de un solo uso, reenvío que invalida enlaces previos y tokens caducados.
- Refresh rotado, detección de reutilización, revocación de familia y aislamiento entre sesiones; dos refresh simultáneos.
- Logout/logout-all y recuperación de contraseña con respuesta genérica e invalidación de sesiones.
- JWT: firma, algoritmo, vencimiento de 15 minutos, claims y rechazo inmediato del rol anterior.
- Perfil, cédula duplicada, rechazo de edición de rol, cambio de contraseña que conserva la sesión actual y cambio de email pendiente de confirmación.
- Avatar falso, demasiado grande y flujo de guardar/servir/borrar PNG.
- Permisos administrativos, lookup limitado a sus cinco campos, prohibición de borrado/desactivación/degradación propia y demociones simultáneas que conservan un admin.
- Alta administrativa sin contraseña, enlace para fijarla, filtros/paginación, soft delete que bloquea acceso y conserva contratos.
- Esquema de 14 tablas, estado único de contratos, seed de variables/plantilla idempotente, restricciones PostgreSQL y helper de auditoría.
- Validación de configuración sin filtrar secretos y errores HTTP uniformes.

## Decisiones

1. **T01 prevalece sobre las diferencias del plan:** el estado tras aprobación es `pending_signatures`, no `approved`. Se usa el túnel PostgreSQL real, no PGlite.
2. Email normalizado a minúsculas con CHECK e índice único sobre lower(email), sin requerir la extensión citext. Las cédulas vacías quedan fuera del índice único. El soft delete conserva la reserva de email y cédula.
3. El cambio de email utiliza `users.pending_email` y guarda el destinatario en el token de confirmación. El correo vigente se sustituye solo al confirmar. Emitir otro enlace invalida los anteriores del mismo tipo.
4. Se añade `sid` a los claims sub/role para identificar la sesión actual al cambiar contraseña: la cookie refresh, por su path, no se envía a `/me/password`.
5. Las operaciones de tokens se serializan por usuario en transacciones. La detección de reutilización devuelve un resultado de error fuera de la transacción, de modo que la revocación de la familia se confirme y no se revierta.
6. Las modificaciones de administradores usan advisory lock transaccional y revalidación del actor para cubrir demociones concurrentes.
7. La revocación de refresh impide renovar el acceso. Los JWT ya emitidos mantienen su vigencia máxima de 15 minutos, excepto los cambios de rol, desactivación y borrado, que se comprueban inmediatamente en BD.
8. La auditoría puede referirse a una entidad sin contrato y conserva las entradas si se elimina físicamente un contrato. Borrar un usuario físicamente no elimina sus contratos; la API utiliza soft delete.
9. El envío de correo sucede después del commit. Un fallo de envío se registra sin contenido sensible y se conserva una respuesta genérica; T01 no incorpora una cola durable. Producción exige SMTP_URL.
10. La plantilla del seed tiene un UUID fijo para idempotencia. Su redacción se conserva de Supabase, incluida la mención original a pesos colombianos; la moneda por defecto del nuevo esquema es DOP. Puede adaptarse esa redacción en T02 si procede.
11. Se incluye un override de esbuild bajo `@esbuild-kit/core-utils` para evitar la versión antigua que arrastra la herramienta de migraciones. La auditoría local devuelve cero; no sustituye la comprobación online pendiente.

## Pendiente externo

Con acceso de red al registro, ejecutar desde `api/`:

```sh
npm audit
```

Este es el único criterio de aceptación que no se pudo cerrar por completo en esta sesión. No quedan fallos funcionales conocidos en las pruebas ejecutadas. Los endpoints de contratos siguen reservados para T02.
