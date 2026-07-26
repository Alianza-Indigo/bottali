# Arquitectura

Este documento describe cómo está construida la plataforma: el stack técnico, la
organización de capas dentro de `lib/`, el pipeline conversacional completo (§12/§15
del spec original), el motor de herramientas con su máquina de estados, la
abstracción de proveedores de IA ("bring your own backend") y los mecanismos
transversales de seguridad, observabilidad y trabajos en segundo plano. El
objetivo es que un ingeniero nuevo pueda ubicar cualquier pieza del sistema a
partir de esta lectura, con rutas de archivo reales en cada sección.

Para variables de entorno y despliegue en Vercel ver `docs/deployment-vercel.md`.
Para el detalle de PWA por herramienta ver `docs/pwa.md`.

## 1. Stack y configuración base

| Pieza | Detalle |
|---|---|
| Framework | Next.js 15 (`next@15.5.21`), App Router, `react@19.1.1` |
| Lenguaje | TypeScript estricto (`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`) |
| Base de datos | Postgres vía `postgres` + Drizzle ORM (`drizzle-orm@0.45.2`), esquema en `db/schema/` |
| Estilos | Tailwind CSS (`tailwind.config.ts`, `postcss.config.mjs`) |
| Estado de servidor en cliente | TanStack Query (`@tanstack/react-query`) |
| Borradores locales | IndexedDB (`lib/chat/drafts.ts`) |
| Formularios admin | React Hook Form + Zod resolvers (`@hookform/resolvers`) |
| Autenticación | Sesiones propias con cookie httpOnly + Argon2 (`@node-rs/argon2`) + TOTP para MFA |
| Storage de archivos | Adaptador desacoplado: Vercel Blob o disco local (`lib/storage/`) |
| Rate limiting / cache | Upstash Redis (REST) cuando está configurado |
| Trabajos asíncronos | Cola propia sobre Postgres, drenada por cron (`lib/jobs/`) |
| Observabilidad | Logger JSON propio, Sentry condicional, OpenTelemetry condicional |
| Pruebas | Vitest (unit/integration), Playwright (e2e, accesibilidad axe, seguridad, rendimiento) |

`next.config.ts` define cabeceras de seguridad estrictas (CSP, `X-Frame-Options: DENY`,
HSTS, `Permissions-Policy`) aplicadas a toda ruta vía `headers()`, y excluye del
bundling de webpack los paquetes nativos de OpenTelemetry/Sentry
(`serverExternalPackages`) para que se resuelvan como `require()` en tiempo de
ejecución en vez de romper el build.

El proyecto es explícitamente **"bring your own backend"**: cada integración externa
(LLM, embeddings, moderación, voz, storage, email, jobs) tiene una interfaz TypeScript
con una implementación real y una implementación "fake"/local intercambiables por
variable de entorno — ver la sección 5.

## 2. Layout de directorios

| Directorio | Responsabilidad |
|---|---|
| `app/(public)/` | Páginas sin sesión: login, registro, verificación de email, recuperación de contraseña |
| `app/(user)/` | Área autenticada del usuario final: dashboard, catálogo de herramientas (`tools/[slug]`), conversaciones, archivos, notificaciones, perfil/MFA, accesibilidad, privacidad |
| `app/admin/` | Panel administrativo: constructor de herramientas (`tools/[id]`), usuarios, grupos, roles, proveedores, base de conocimiento, evaluaciones, auditoría, analítica, seguridad, ajustes, jobs |
| `app/api/v1/` | Todos los Route Handlers de la API HTTP, agrupados por dominio (`auth/`, `catalog/`, `conversations/`, `messages/`, `files/`, `generated-files/`, `admin/**`, `cron/`, `health/`, `speech/`, `voices/`, `me/`, `notifications/`) |
| `app/manifest.ts` | Web App Manifest del shell general de la plataforma |
| `components/` | Componentes de React por dominio: `chat/`, `catalog/`, `admin/`, `files/`, `forms/`, `notifications/`, `privacy/`, `profile/`, `accessibility/`, `pwa/`, `layout/`, `providers/`, `ui/` |
| `lib/` | Toda la lógica de negocio y de acceso a datos, en capas — ver sección 3 |
| `db/schema/` | Definición Drizzle del esquema Postgres, una tabla lógica por archivo (`tools.ts`, `conversations.ts`, `auth.ts`, `rbac.ts`, `providers.ts`, `knowledge.ts`, `files.ts`, `jobs.ts`, `audit.ts`, `usage.ts`, `notifications.ts`, `settings.ts`, `evaluations.ts`, `enums.ts`) |
| `db/migrations/` | Migraciones SQL generadas por `drizzle-kit` (`npm run db:generate`) |
| `db/seed/` | `bootstrap-admin.ts` (RBAC + cuenta SUPER_ADMIN, siempre) y `demo.ts` (datos de demostración, solo fuera de `APP_ENV=production`) |
| `middleware.ts` | CSRF de doble cookie, cabecera `x-request-id`, redirección de UX para rutas protegidas |
| `instrumentation.ts` | Arranque condicional de OpenTelemetry/Sentry |
| `scripts/` | `migrate.ts`, `seed.ts`, `verify-env.ts`, `generate-pwa-assets.ts`, `test-providers.ts` |
| `public/` | Assets estáticos: íconos PWA, `sw.js` (service worker del shell), `offline.html` |
| `tests/` | `unit/`, `integration/`, `e2e/`, más specs de rendimiento (Playwright) |

## 3. Capas dentro de `lib/`

El patrón de dependencia es siempre el mismo: **`app/api/v1/**/route.ts` valida
la request y la sesión, delega en un servicio de `lib/`, y el servicio es el
único que toca `db/schema` a través de `lib/db/client.ts`.** Ningún Route Handler
ejecuta SQL/Drizzle directamente.

| Capa (`lib/...`) | Qué contiene | Consumida por |
|---|---|---|
| `auth/` | `session.ts` (cookies de sesión), `password.ts` (Argon2), `totp.ts` (MFA), `tokens.ts` (verificación de email / reseteo), `current-user.ts` (`requireCurrentUser()`) | Casi toda ruta protegida y `lib/permissions/` |
| `permissions/` | `definitions.ts` (catálogo de roles y permisos), `rbac.ts` (resolución rol→permiso), `require.ts` (`requireUserWithPermission()`), `admin-guard.ts`, `seed-rbac.ts` | Rutas `app/admin/**` y `app/api/v1/admin/**` |
| `db/` | `client.ts`: instancia única de Drizzle sobre `postgres-js`, reutilizada entre invocaciones tibias; expone los tipos `DbOrTx`/`Transaction` para funciones que aceptan tanto `db` como un `tx` en curso | Todo `lib/*/service.ts` y `repository.ts` |
| `tools/` | `service.ts` (mutaciones + máquina de estados), `repository.ts` (lecturas + `FullVersionConfig`), `state-machine.ts`, `access.ts` (`canUserAccessTool`), `validation-publish.ts` | `app/api/v1/tools/**`, `app/api/v1/admin/tools/**`, `lib/conversations/pipeline.ts` |
| `conversations/` | `pipeline.ts` (motor de generación, ver sección 4), `service.ts`, `limits.ts` (cuotas/presupuesto), `memory.ts`, `tool-confirmations.ts` | `app/api/v1/conversations/**`, `app/api/v1/messages/**` |
| `ai/` | `registry.ts` (fábrica de proveedores), `providers/` (implementaciones real/fake), `types.ts`, `tools/` (herramientas internas + APIs externas), `usage/cost.ts`, `context/`, `memory/`, `moderation/`, `prompts/` | `lib/conversations/pipeline.ts`, `lib/knowledge/retrieval.ts` |
| `knowledge/` | `service.ts`, `extraction.ts` (PDF/DOCX vía `pdf-parse`/`mammoth`), `chunking.ts`, `retrieval.ts` (RAG), `state-machine.ts` | `app/api/v1/admin/knowledge-*`, pipeline conversacional |
| `files/` | `service.ts` (adjuntos de usuario y documentos generados), `validate.ts` | `app/api/v1/files/**`, `app/api/v1/generated-files/**`, pipeline |
| `storage/` | `types.ts` (interfaz `StorageAdapter`), `vercel-blob.ts`, `local-disk.ts`, `index.ts` (fábrica) | `lib/files/service.ts` |
| `jobs/` | `types.ts`, `providers.ts` (`SyncJobProvider`/`CronPollingJobProvider`), `registry.ts`, `service.ts`, `handlers/` | `app/api/v1/cron/daily`, `app/api/v1/admin/jobs/**` |
| `audit/` | `log.ts`: `recordAuditEvent()`, único punto de escritura en la tabla de auditoría | Prácticamente todo servicio que muta estado |
| `security/` | `csrf.ts`, `crypto.ts`, `rate-limit.ts`, `cron-auth.ts` (`assertValidCronRequest`) | `middleware.ts`, `app/api/v1/cron/**`, rutas sensibles |
| `admin/` | `users-service.ts`, `conversation-content.ts` (lectura controlada de contenido de conversación por soporte/auditoría) | `app/api/v1/admin/**` |
| `validation/` | `tools.ts` (esquemas Zod de cada sección de configuración), `auth.ts`, `http.ts` (`handleApiError`, envoltura de respuesta) | Toda ruta de API |
| `observability/` | `logger.ts`, `request-context.ts`, `sentry.ts` | `middleware.ts`, rutas, jobs |
| `chat/` | `drafts.ts` (IndexedDB), `stream-reader.ts` (lector del stream SSE/fetch en el cliente) | Componentes de `components/chat/` |
| `notifications/` | `email.ts` (proveedor SMTP/consola) | Flujos de registro, invitaciones, notificaciones in-app |
| `evaluations/` | `service.ts`: ejecución de casos de prueba contra una versión de herramienta | `app/api/v1/admin/evaluations/**` |
| `legal/` | `seed-legal.ts`: aviso de privacidad por defecto | `db:seed`, `app/(user)/privacy` |
| `analytics/` | Agregaciones para los endpoints `app/api/v1/admin/analytics/**` | Panel de analítica admin |
| `api/` | `client.ts`: cliente HTTP tipado usado desde componentes cliente (inyecta el token CSRF) | Componentes React con TanStack Query |
| `utils/` | `errors.ts` (`AppError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `RateLimitError`, `BudgetExceededError`), helpers varios | Todas las capas |

## 4. Pipeline conversacional (`lib/conversations/pipeline.ts`)

Este archivo es el corazón del producto: recibe un mensaje de usuario y produce
una respuesta del modelo, con todo el gobierno de negocio en el medio. Expone
tres puntos de entrada — `sendMessage`, `regenerateResponse` y
`resumeAfterToolConfirmation` — que comparten dos funciones internas:
`generateReply` (construir contexto + generar) y `finalizeGeneration`
(persistir + contabilizar).

### 4.1 Flujo de `sendMessage` (mensaje nuevo)

```
Cliente ── POST /api/v1/conversations/[id]/messages ──▶ sendMessage()
  1. resolveGenerationContext(conversationId, userId)
     - conversación ACTIVE y del usuario
     - herramienta PUBLISHED y canUserAccessTool() (RBAC + accessRules)
     - loadVersionConfig(toolVersionId) → branding/behavior/models/capabilities/
       accessRules/safetyPolicies/pwaConfig
     - modelo primario (providerModels) resuelto
  2. expirePendingConfirmationsForConversation() — una confirmación pendiente
     vieja no bloquea un mensaje nuevo; su reserva se libera
  3. Moderación de entrada (safetyPolicies.inputModeration) vía
     getModerationProvider().evaluate() → si flagged, se persiste el mensaje
     como BLOCKED y se corta aquí
  4. Se inserta el mensaje de usuario (role="user") en `messages`
  5. Adjuntos: si capabilities.files y hay attachedFileIds, se re-validan
     ownership/status server-side (attachFilesToMessage)
  ──▶ generateReply(ctx, ...)
  6. reserveUsage(): límite diario de mensajes, límite mensual de tokens y
     presupuesto mensual — transacción con advisory lock (user, tool) +
     idempotencyKey ligada al id del mensaje recién insertado
  7. Ensamblado de contexto:
     - historial: últimos 20 mensajes si capabilities.history !== false
     - memoria: retrieveMemory() si capabilities.memory && memoryMode != DISABLED
     - RAG: retrieveRelevantChunks() + buildKnowledgeContextBlock() si
       capabilities.rag (envuelve el material recuperado como "datos, no
       instrucciones" — mitigación de inyección de prompt)
     - system prompt = behavior.systemPrompt + reglas + memoria + bloque RAG
  8. Tools disponibles: allowedInternalTools (gateado por
     capabilities.internalTools) + externalApiEndpoints (gateado por
     capabilities.externalApis) → ToolSpec[] para el LLM
  9. Si hay tools: runToolRoundLoop() (ver 4.2); si no: streaming directo
     provider.stream() con moderación de salida en ventanas rodantes
  10. finalizeGeneration(): persiste el mensaje assistant, guarda archivos
      generados, reconcilia uso/costo, actualiza la conversación, genera
      título si aplica, registra memoria, evento de auditoría y notificación
◀── stream de StreamEvent: delta | done | blocked | error | confirmation_required
```

### 4.2 Bucle de llamadas a herramientas (`runToolRoundLoop`)

Cuando la herramienta tiene `internalTools` o `externalApis` habilitados, el
turno deja de ser streaming puro y pasa por un bucle acotado a
`MAX_TOOL_ROUNDS = 4` rondas (constante en `pipeline.ts`):

1. Se llama a `provider.generate()` (no streaming) con las `tools` disponibles;
   la última ronda omite `tools` para forzar una respuesta en texto y así
   garantizar terminación.
2. Si el modelo pide una tool call:
   - Si la tool requiere confirmación (`toolNeedsConfirmation`: toda API
     externa, o una tool interna marcada `requiresConfirmation`, o listada en
     `safetyPolicies.confirmationsRequired`), el bucle **se pausa**: se guarda
     un `generationStateSnapshot` (mensajes acumulados, ronda, uso acumulado,
     llamadas restantes de la misma ronda) en `tool_call_confirmations` y se
     emite `confirmation_required` al cliente.
   - Si no requiere confirmación, se ejecuta (`executeToolCallForPipeline`,
     que nunca lanza — errores se devuelven como `{"error": "..."}` para que
     el modelo pueda recuperarse) y el resultado se añade como mensaje
     `role: "tool"`, envuelto por `wrapToolResultForModel()` con la misma
     instrucción de "esto es dato, no instrucciones".
3. Se repite hasta una respuesta final o el tope de rondas.

`resumeAfterToolConfirmation` es un punto de entrada **separado** (no pasa por
`sendMessage`) porque la aprobación humana puede llegar minutos después, en
otra request HTTP:

- Reclama la confirmación de forma atómica (`UPDATE ... WHERE status='PENDING'
  ... RETURNING`) para que dos aprobaciones concurrentes nunca ejecuten la tool
  dos veces.
- Si se aprueba: ejecuta la tool (o, si es `collect_form_input`, usa
  directamente las respuestas del formulario como resultado) y retoma
  `runToolRoundLoop` desde el snapshot persistido (`round`, `pendingCalls`,
  `accumulatedUsage`, `generatedDocuments`).
- Si se rechaza: inyecta un resultado de error ("el usuario rechazó...") y
  retoma igual el bucle, dejando que el modelo continúe con esa información.

### 4.3 Moderación, streaming y archivos generados

- **Moderación de salida**: en el camino sin tools, el texto se acumula y se
  evalúa en ventanas de `MODERATION_WINDOW_CHARS = 120` caracteres —una
  ventana solo se reenvía al cliente después de pasar moderación, nunca antes.
  En el camino con tools, la respuesta final se modera de una sola vez (no hay
  streaming real cuando hay tool calls, porque JSON de tool-call y prosa
  visible no pueden compartir el mismo stream con seguridad).
- **Documentos generados**: la tool interna `generate_text_document` acumula
  sus salidas en `generatedDocuments` durante el turno; `finalizeGeneration`
  las persiste con `persistGeneratedDocument()` (`lib/files/service.ts`)
  **después** de que el mensaje assistant ya tiene id, y solo si el mensaje no
  quedó `BLOCKED` (para no dejar recuperar contenido que la moderación ocultó).
- **Contabilidad**: `finalizeGeneration` calcula el costo con
  `estimateCostCents()` (`lib/ai/usage/cost.ts`) usando los costos por mil
  tokens del modelo, y llama a `reconcileUsage()` (`lib/conversations/limits.ts`)
  que marca la reserva como `RECONCILED`, inserta en `usage_events` y en
  `cost_events` dentro de una transacción.

## 5. Motor de herramientas (`lib/tools/`)

### 5.1 Estructura de una herramienta

Una `tool` (`db/schema/tools.ts`) tiene un `status` de "producto" y N
`toolVersions` inmutables. Cada versión referencia siete secciones de
configuración, cada una en su propia tabla (relación 1:1 con `toolVersionId`,
cargadas juntas por `loadVersionConfig()` en `lib/tools/repository.ts`):

| Sección | Tabla | Contenido representativo |
|---|---|---|
| `branding` | `toolBranding` | Nombre, descripción, colores, ícono/logo/portada, tags |
| `behavior` | `toolBehavior` | System prompt, reglas, tono, mensaje de bienvenida, preguntas sugeridas, `memoryMode` (nunca se scaffolda por defecto — su ausencia es la señal de configuración incompleta) |
| `models` | `toolModels` | Proveedor/modelo primario y fallback, temperature/topP, límites de tokens, timeouts, `budgetMonthlyCents`, límites por usuario diario/mensual |
| `capabilities` | `toolCapabilities` | Interruptores: `text`, `streaming`, `voiceInput/Output`, `files`, `images`, `forms`, `quickReplies`, `menus`, `memory`, `history`, `rag`, `documentGeneration`, `internalTools`, `externalApis` (+ `externalApiEndpoints` admin-configurados), `notifications`, `evaluations`, `escalation`, `pwa`, `deepLinks` |
| `accessRules` | `toolAccessRules` | Modo de acceso (`ALL_USERS`, etc.), ventana de fechas, cupo, lista de espera, horarios/países permitidos, feature flag |
| `safetyPolicies` | `toolSafetyPolicies` | Nivel de riesgo, disclaimers, temas restringidos, moderación de entrada/salida, `confirmationsRequired`, `allowedInternalTools`, mensaje de contingencia |
| `pwaConfig` | `toolPwaConfigs` | Manifest por herramienta: nombre, colores, `startUrl`/`scope`, shortcuts, subdominio/basePath |

### 5.2 Máquina de estados (`lib/tools/state-machine.ts`)

Hay **dos** máquinas de estado independientes pero relacionadas:

**Nivel herramienta** (`ToolStatus`, ciclo de vida "de producto"):

```
DRAFT ──▶ CONFIGURATION_INCOMPLETE ──▶ INTERNAL_TESTING ──▶ UNDER_REVIEW
  ▲              │                        │                    │
  └──────────────┘                        ▼                    ▼
                                        DRAFT              APPROVED ──▶ SCHEDULED ──▶ PUBLISHED
                                                                              │              │
                                                                              ▼              ▼
                                                                         APPROVED    PAUSED / SUSPENDED / ARCHIVED
```

**Nivel versión** (`ToolVersionStatus`, ciclo de vida de un borrador concreto):
`DRAFT → TESTING → UNDER_REVIEW → APPROVED → SCHEDULED → PUBLISHED → SUPERSEDED
/ ROLLED_BACK`. Una herramienta puede estar `PUBLISHED` (sirviendo
`publishedVersionId`) mientras una versión `DRAFT` distinta se edita en
paralelo para el siguiente release — `ensureEditableDraftVersion()` en
`lib/tools/service.ts` crea ese borrador copiando la versión publicada si aún
no existe uno.

Ambas transiciones se validan con `assertValidToolTransition`/
`assertValidVersionTransition` contra tablas de transición explícitas —
cualquier salto fuera de tabla lanza `ConflictError`. `publishVersion()` es
idempotente (publicar una versión ya publicada es un no-op), marca la versión
previa como `SUPERSEDED`, y `rollbackToVersion()` nunca muta una versión
antigua: crea una versión **nueva** con esa configuración copiada y la
publica, preservando el historial completo e inmutable.

### 5.3 Otras operaciones relevantes

- `compareVersions()`: diff campo a campo entre dos versiones, sección por
  sección.
- `duplicateTool()`: clona configuración completa bajo un slug nuevo.
- `processScheduledPublications()`: invocado por el cron diario, publica toda
  versión `SCHEDULED` cuya fecha ya llegó.
- Cada mutación pasa por `recordAuditEvent()` (`lib/audit/log.ts`).

## 6. Abstracción de proveedores de IA (`lib/ai/`)

`lib/ai/registry.ts` es la única fábrica de proveedores; nada más en el código
importa una implementación concreta directamente. Cada `get*Provider()` decide
real vs. fake leyendo `lib/env.ts` (validado con Zod, falla rápido si algo
requerido falta):

| Proveedor | Variable selectora | Real | Fake / deshabilitado |
|---|---|---|---|
| LLM | `LLM_PROVIDER` | `OpenAICompatibleLLMProvider` (requiere `LLM_API_KEY`) | `FakeLLMProvider` (determinista) |
| Embeddings | `EMBEDDING_PROVIDER` | `OpenAICompatibleEmbeddingProvider` | `FakeEmbeddingProvider` |
| Moderación | `MODERATION_PROVIDER` | `OpenAICompatibleModerationProvider` | `FakeModerationProvider` |
| Voz (STT) | `STT_PROVIDER` | `OpenAICompatibleSpeechToTextProvider` | `FakeSpeechToTextProvider` / `DisabledSpeechToTextProvider` |
| Voz (TTS) | `TTS_PROVIDER` | `OpenAICompatibleTextToSpeechProvider` | `FakeTextToSpeechProvider` / `DisabledTextToSpeechProvider` |

Todas las implementaciones reales apuntan a cualquier endpoint compatible con
la API de OpenAI (`LLM_API_BASE_URL`), lo que permite usar proveedores
alternativos sin cambiar código. `scripts/verify-env.ts` bloquea el arranque en
`APP_ENV=production` si cualquiera de `LLM_PROVIDER`/`EMBEDDING_PROVIDER`/
`MODERATION_PROVIDER`/`STT_PROVIDER`/`TTS_PROVIDER` sigue en `fake` (STT/TTS sí
aceptan `disabled`).

`lib/ai/tools/` contiene las **tools internas** invocables por el modelo
(`registry.ts`): `calculator`, `datetime`, `generate_text_document`,
`collect_form_input` (siempre `requiresConfirmation: true` — sus respuestas
son directamente el resultado, no hay ejecución posterior) y
`knowledge_base_query`. `execute.ts` las ejecuta contra el allow-list efectivo
de la herramienta. `external.ts` implementa las **APIs externas
admin-configuradas**: el modelo solo puede invocar por `name` un endpoint que
el admin ya registró con su URL fija — nunca puede suministrar ni influir la
URL destino, lo que cierra la vía de SSRF; la respuesta se trunca a 100 KB y
la llamada tiene timeout de 8 s.

## 7. Middleware y seguridad transversal

`middleware.ts` corre en el edge runtime sobre `/dashboard/:path*`,
`/tools/:path*`, `/admin/:path*`, `/api/:path*`, etc. y hace tres cosas, **ninguna
de las cuales sustituye la autorización real** (que siempre se revalida
server-side con `requireCurrentUser()`/`requirePermission()` en cada Server
Component/Route Handler):

1. Propaga/genera `x-request-id`, tanto a la request downstream como a la
   respuesta — es la correlación que usa `lib/audit/log.ts` y el logger para
   agrupar eventos de una misma request.
2. Redirige a `/login` por presencia de cookie (UX únicamente, sin acceso a
   base de datos) en rutas protegidas.
3. Aplica CSRF de doble cookie (`lib/security/csrf.ts`) a todo método mutante
   (`POST`/`PUT`/`PATCH`/`DELETE`) bajo `/api/`, salvo rutas exentas (login,
   registro, verificación de email, reset de contraseña, `/api/v1/cron/*`, que
   usan su propio mecanismo — `Authorization: Bearer $CRON_SECRET` validado
   por `lib/security/cron-auth.ts`).

Cabeceras de seguridad (CSP, `X-Frame-Options`, HSTS, `Permissions-Policy`) se
generan en `next.config.ts` para toda ruta, no en el middleware.

## 8. Observabilidad (`lib/observability/`)

- `logger.ts`: logger JSON propio sin dependencia externa (una línea de JSON
  por evento a stdout/stderr, filtrado por `LOG_LEVEL`) — Vercel ya ingiere
  stdout/stderr como logs estructurados, así que una librería como pino/winston
  sería redundante.
- `request-context.ts`: `getCurrentRequestId()` lee el `x-request-id` que
  `middleware.ts` estampó (vía `next/headers`), con fallback a un UUID nuevo
  para contextos sin request activa (jobs/cron invocados directamente,
  scripts).
- `sentry.ts` + `instrumentation.ts`: Sentry y OpenTelemetry se inicializan
  **solo si** `SENTRY_DSN` / `OTEL_EXPORTER_OTLP_ENDPOINT` están configurados —
  ausentes en desarrollo, no añaden overhead ni requieren credenciales.
- `lib/audit/log.ts`: `recordAuditEvent()` es el único punto de escritura de la
  tabla de auditoría; casi cada mutación de negocio (transición de estado de
  herramienta, generación de mensaje, cambios de RBAC, etc.) pasa por aquí con
  `actorId`, `action`, `resourceType/Id`, `correlationId` y `metadata`.

## 9. Trabajos en segundo plano (`lib/jobs/`)

La cola es una tabla Postgres, no un servicio externo. `lib/jobs/providers.ts`
define dos implementaciones de la interfaz `JobProvider`
(`enqueue`/`getStatus`/`cancel`/`healthcheck`), elegidas por `JOB_PROVIDER`:

- `SyncJobProvider` (`JOB_PROVIDER=sync`, por defecto en desarrollo): ejecuta
  el job inline dentro de la misma request.
- `CronPollingJobProvider` (`JOB_PROVIDER=vercel-queue`, obligatorio en
  producción porque las funciones de Vercel no mantienen estado entre
  requests): persiste el job como `QUEUED` y retorna de inmediato; el drenado
  ocurre por cron.

`lib/jobs/registry.ts` es una tabla de lookup `tipo → handler`; cada módulo de
`lib/jobs/handlers/` (`export.ts`, `files.ts`, `knowledge.ts`, `platform.ts`,
`retention.ts`, `tool-confirmations.ts`) registra sus propios tipos al
importarse. `app/api/v1/cron/daily/route.ts` es el único cron declarado en
`vercel.json` (el plan Hobby de Vercel limita a frecuencia diaria) y en una
sola invocación: drena hasta 200 jobs pendientes
(`processPendingJobs`), publica versiones programadas
(`processScheduledPublications`), y corre en secuencia
`cleanup_expired_files`, `expire_pending_tool_confirmations`,
`retention_cleanup` y `provider_health_check`. Un plan de pago permitiría
volver a crons más frecuentes sin cambiar la interfaz.

## 10. Arquitectura PWA (resumen)

Hay dos niveles de Web App Manifest, ambos generados dinámicamente (no
archivos estáticos): el shell general en `app/manifest.ts` (branding fijo de la
plataforma, `start_url: /dashboard`) y un manifest **por herramienta** servido
por `app/api/v1/catalog/[id]/manifest/route.ts`, construido en cada request a
partir de `pwaConfig` + `branding` de la versión **publicada**, gateado por
`capabilities.pwa`. Esto significa que un cambio de branding o de configuración
PWA se refleja en cuanto se publica una nueva versión, sin redeploy. El service
worker (`public/sw.js`) y la página offline (`public/offline.html`) son
estáticos y compartidos; los íconos se generan con
`npm run pwa:icons` (`scripts/generate-pwa-assets.ts`). El detalle completo
(estrategias de cache, instalación por subdominio/`basePath`, shortcuts) está en
`docs/pwa.md`.

## 11. RBAC (resumen)

`lib/permissions/definitions.ts` fija un catálogo cerrado de 11 roles
(`SUPER_ADMIN` … `USER`) y ~28 permisos granulares (`tools.publish`,
`conversations.content.read`, `providers.manage`, etc.), con la matriz
rol→permiso declarada en `ROLE_PERMISSIONS` y sembrada por
`db/seed/bootstrap-admin.ts`. `lib/permissions/require.ts` expone
`requireUserWithPermission(permission)`, el guard que usa prácticamente todo
Route Handler bajo `app/api/v1/admin/**`.
