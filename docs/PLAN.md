# SIMAUD-LEX — Plan de migración a backend propio y pulido de la interfaz

> Documento vivo. Lo mantiene Claude (líder técnico y frontend). Codex (gpt-6.1-sol, medium) escribe lógica de backend por tareas acotadas; todo lo que entrega lo revisa Claude antes de integrarlo.

## 1. Diagnóstico (resumen)

**El flujo de negocio está bien definido** (plantillas → variables → contrato → aprobación → firmas → vigencia/vencimiento → renovación/cancelación/archivo, con 4 roles). El problema es *dónde* y *cómo* está implementado:

### Backend actual (Supabase) — 94 migraciones, 10 edge functions
- **Críticos de seguridad**
  - Cualquiera puede registrarse como `admin`: el trigger `handle_new_user` toma `role` de la metadata del signup, y RLS deja que cada usuario edite su propia fila, `role` incluido.
  - `dashboard-stats`, `reports-*`, `contract-lifecycle` y `contract-expiry-checker` usan la service role **sin validar JWT** y se fían de `role` y `userId` que llegan por query. Con la anon key se leen cédulas, teléfonos y contratos de todos.
  - RLS de lectura global: cualquier autenticado lee todos los contratos, firmantes, auditoría y perfiles.
  - El flujo de aprobación se puede saltar: el creador puede ponerse `approved` o `signed` a sí mismo y el solicitante puede aprobar su propia solicitud.
  - `contract_signatories` tiene una política `USING(true)`: cualquiera puede borrar o apropiarse de firmantes ajenos.
  - Hay XSS en el HTML del PDF y en la exportación.
- **Funcionales**
  - El admin no puede crear, editar ni borrar usuarios: no hay política RLS y `auth.admin` se llama desde el navegador.
  - Triggers duplicados y conflictivos (auditoría, firmas, alta de perfil).
  - Las renovaciones se pueden aprobar dos veces.
  - No hay cron: los estados por fecha solo se recalculan con la pantalla de Configuración del admin abierta.
  - Tres campos de estado solapados: `status`, `approval_status` y `actual_status`.
  - La firma se guarda en base64 dentro de la BD, con IP `127.0.0.1` fija y sin respetar `signing_order`.
  - El "PDF" es HTML abierto con `window.open`.
  - No se pueden reproducir las migraciones desde cero.

### Frontend actual — React, ~25k líneas
- Lógica de negocio en el cliente: transiciones de estado en varios pasos sin transacción, `setTimeout(500)` para esperar triggers, render de plantillas y cálculos de estadísticas.
- El shell de dashboard está copiado 4 veces y hay componentes de más de 1000 líneas (UserDashboard, ContractModal, ContractViewModal).
- No hay primitivas de UI: ~16 modales hechos a mano, sin Escape, foco ni `role=dialog`.
- La navegación es por `useState`, así que no hay URLs; F5 y el botón Atrás no funcionan.
- Bugs visibles:
  - crash en GestorDashboard («Ver Mis Contratos»);
  - el registro no muestra los errores;
  - el toggle de archivados no hace nada;
  - los filtros de estado comparan contra el campo equivocado;
  - `generated_content` se guarda desactualizado;
  - la exportación rápida usa la configuración anterior;
  - el menú «⋯» solo funciona con hover y deja pulsar «Eliminar» sin verlo.
- KPIs inventados en Reportes, botones sin acción, modal de cancelación inalcanzable, ~100 `console.log`, 13 `alert`/`confirm`, ~125 `any` y 132 errores de `tsc` (el build no comprueba tipos).

## 2. Arquitectura objetivo

```
SIMAUD_CFG/
├─ web/              ← frontend actual (React 19 + Vite 8 + Tailwind 4)
├─ api/              ← backend nuevo
├─ packages/shared/  ← esquemas Zod + tipos + enums compartidos (contrato front↔back)
└─ docs/
```

| Pieza | Elección | Por qué |
|---|---|---|
| Runtime | Node 24 + TypeScript | Mismo lenguaje que el front; se comparten tipos |
| HTTP | Fastify 5 | Rápido, validación por esquema, plugins de auth, multipart y rate-limit |
| BD | PostgreSQL 16+ | Es el mismo motor que Supabase, así que la migración de datos es directa |
| ORM / migraciones | Drizzle ORM + drizzle-kit | SQL explícito, tipado, migraciones limpias y reproducibles |
| Dev local sin Docker | PGlite (Postgres embebido) | En este PC no hay Docker ni Postgres instalados |
| Validación | Zod (en `packages/shared`) | La misma validación en el formulario y en el endpoint |
| Auth | JWT de acceso de corta duración + refresh token rotado en cookie httpOnly; contraseñas con argon2 | Sustituye a Supabase Auth |
| Email | Nodemailer (SMTP configurable) | Confirmación de cuenta, recuperación de contraseña y avisos |
| Jobs | Scheduler interno (node-cron) con lock en BD | Recálculo diario de estados y avisos de vencimiento a 30/15/7/1 días |
| Archivos | Disco local o S3 compatible (interfaz `Storage`) | Avatares e imágenes de firma fuera de la BD |
| PDF | Generación real en el servidor (pdfmake o Playwright) | Descarga `application/pdf` |
| Tiempo real | SSE `/events` | Notificaciones y cambios de rol sin polling cada 30 s |
| Tests | Vitest + inyección HTTP de Fastify | Cada endpoint de dominio con su test |
| Front datos | TanStack Query + cliente `api.ts` | Caché, reintentos, estados de carga y error consistentes |

### Modelo de estados unificado
Los tres campos actuales se sustituyen por **una sola** máquina de estados en el servidor:

```
draft ──submit──▶ pending_approval ──approve──▶ approved (pendiente de firmas)
  ▲                    │ reject                       │ todas las firmas (respetando signing_order)
  └──── rejected ◀─────┘                              ▼
                                                   active ──(cron)──▶ expiring_soon ──▶ expired
                                                     │                                    │
                                     cancel ◀────────┴──────── renew ─────────────────────┘
                                   cancelled                  renewed (+ contrato hijo en draft)
```
`archived` se mantiene como una bandera aparte. Cada transición se hace en un endpoint transaccional que comprueba el rol, escribe auditoría y genera las notificaciones que correspondan.

## 3. Fases

### Fase 0 — Fundaciones ✅ / 🔄
- [x] Dependencias actualizadas a las últimas versiones: React 19, Vite 8, Tailwind 4, TS 6, ESLint 10, react-router 7.18. `npm audit` da **0 vulnerabilidades** (antes 27: 1 crítica y 17 altas).
- [x] Migración de Tailwind 3 a 4 hecha con el codemod oficial; build OK.
- [ ] Reestructurar en monorepo (`web/`, `api/`, `packages/shared`) con npm workspaces.
- [ ] Añadir `tsc` al build y dejar en 0 los 132 errores de tipos actuales.

### Fase 1 — Backend: núcleo (Codex escribe, Claude revisa)
1. Esquema Drizzle a partir del **esquema final limpio** (no se replican las 94 migraciones): users, refresh_tokens, templates, variables, contracts, signatories, versions, approvals, audit_logs, renewals, cancellations, notifications y files.
2. Auth: register, confirm-email, login, refresh, logout, forgot y reset password. El rol **nunca** lo decide el cliente.
3. Middleware de rol y política de acceso por recurso: el gestor ve los suyos, el firmante solo los contratos donde firma, admin y supervisor ven todo.
4. `/me` (perfil, email, contraseña, avatar) y `/users` (CRUD de admin, que hoy está roto).
5. Seed de desarrollo: un usuario por rol, variables y plantilla de ejemplo.

### Fase 2 — Backend: dominio de contratos
6. Plantillas y variables (CRUD; extracción y validación de `{{var}}` en el servidor; 409 si están en uso).
7. Contratos: crear (contrato, firmantes y v1 en una transacción), editar con versionado, render del contenido en el servidor, archivar y borrar.
8. Transiciones: submit, approve, reject, cancel, uncancel y override de admin (auditado).
9. Firmas: bandeja del firmante, firma con imagen a storage, IP y user agent reales, `signing_order` y cierre automático cuando firman todos.
10. Renovaciones: solicitar, aprobar, rechazar y escalar, de forma idempotente y transaccional.
11. Notificaciones con SSE, y jobs cron de estados por fecha y avisos de vencimiento.
12. Estadísticas por rol (sacando el rol del token), reportes y exportación CSV/XLSX/PDF reales, y PDF del contrato.

### Fase 3 — Frontend: sistema de diseño (Claude)
13. Tokens de marca en Tailwind 4 (`@theme`): un solo color primario y escala de grises; el acento por rol queda como detalle secundario, no como tema completo.
14. Primitivas: `Button`, `Input`, `Select`, `Modal` accesible (Escape, foco, scroll lock, AnimatePresence), `ConfirmDialog`, `Toast`, `Badge` de estado en español, `DataTable`, `EmptyState`, `Skeleton`, `DropdownMenu` (clic y teclado) y `StatCard`.
15. `DashboardLayout` único (sidebar, header y avatar) con rutas reales: `/app/contratos`, `/app/aprobaciones`, etc., guard por rol y carga diferida por ruta (el bundle pesa 1.1 MB).

### Fase 4 — Frontend: conexión al backend y rehacer pantallas (Claude)
16. `api.ts` y hooks de TanStack Query por dominio; el cliente de Supabase desaparece.
17. Se rehace pantalla por pantalla sobre las primitivas, en este orden:
    1. Auth y landing.
    2. Contratos (lista, crear, ver).
    3. Aprobaciones.
    4. Firma.
    5. Renovaciones.
    6. Plantillas y variables.
    7. Usuarios.
    8. Notificaciones.
    9. Reportes.
    10. Perfil.
    11. Configuración.
18. Se arreglan todos los bugs de la sección 1, se quitan los KPIs falsos, los `console.log`, los `alert` y el código muerto, y se pasa a estados de carga, vacío y error consistentes.

### Fase 5 — Datos, despliegue y QA
19. Script de migración de datos de Supabase a la BD nueva (usuarios con reseteo de contraseña obligatorio, contratos, firmas y archivos), si hay datos reales que conservar.
20. Despliegue: el front sigue en Vercel y la API va a un VPS, Railway o Render con Postgres gestionado; variables de entorno documentadas.
21. Tests: unitarios de la máquina de estados y los permisos, de integración por endpoint, y un smoke e2e de los flujos principales.
22. Borrar `supabase/` y la dependencia `@supabase/supabase-js`.

## 4. Reparto de trabajo

| Quién | Qué |
|---|---|
| **Claude** | Liderazgo, este plan, contratos de API en `packages/shared` (se definen **antes** de que Codex implemente), todo el frontend y el diseño, integración y **revisión de cada entrega de Codex** (diff, tests, seguridad) |
| **Codex** | Implementación del backend por tareas acotadas (fases 1 y 2), tests de backend, script de migración de datos |

Mecánica: Claude escribe una tarea con alcance, archivos, contrato Zod y criterios de aceptación → Codex la implementa (`codex exec`) → Claude revisa, corrige o devuelve la tarea → se hace commit. Mientras Codex hace el backend, Claude avanza las fases 3 y 4 en paralelo contra los mismos contratos.

## 5. Orden de arranque inmediato
1. Monorepo y `packages/shared` con enums y esquemas Zod de auth, usuarios y contratos (Claude).
2. Codex: esqueleto de `api/`, esquema Drizzle, auth completa y seed (en paralelo).
3. Claude: tokens, primitivas, `DashboardLayout` y rutas.
4. Conectar la auth del front a la API nueva → primera pantalla de punta a punta.
