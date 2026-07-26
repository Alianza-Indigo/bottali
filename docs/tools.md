# Motor de herramientas (`lib/tools/`)

Este documento profundiza en el subsistema que `docs/architecture.md` solo
resume en su sección 5: cómo se modela una "herramienta" (el equivalente a un
GPT personalizado configurable por un administrador), su doble máquina de
estados, las siete secciones de configuración con sus esquemas Zod completos,
las reglas de acceso y cómo las capacidades configuradas se traducen en tools
reales disponibles para el modelo durante una conversación. Para el pipeline
conversacional que consume todo esto ver `docs/architecture.md` §4; para el
detalle de PWA por herramienta ver `docs/pwa.md`.

## 1. Resumen: qué es una "herramienta" y una "versión"

Una **herramienta** (tabla `tools`, `db/schema/tools.ts`) es el registro de
"producto": tiene un `slug` único, categoría, equipo responsable
(`responsibleUserId`), un `status` de ciclo de vida y dos punteros —
`publishedVersionId` y `draftVersionId` — hacia sus versiones. No contiene
ninguna configuración por sí misma.

Toda la configuración vive en una **versión** (tabla `toolVersions`), que es
**inmutable una vez publicada**: cada versión tiene un `versionNumber`
correlativo por herramienta, su propio `status` (máquina de estados
independiente, ver §3), y referencia siete tablas hijas 1:1
(`toolVersionId` único) que juntas forman el objeto `FullVersionConfig`
(`lib/tools/repository.ts`):

| Sección (`FullVersionConfig`) | Tabla Drizzle | Contenido representativo |
|---|---|---|
| `branding` | `toolBranding` | Nombre, descripción, colores, ícono/logo/portada, tags |
| `behavior` | `toolBehavior` | System prompt, reglas, tono, mensaje de bienvenida, `memoryMode` |
| `models` | `toolModels` | Proveedor/modelo primario y fallback, temperature/topP, límites, presupuesto |
| `capabilities` | `toolCapabilities` | Interruptores de funcionalidad + `externalApiEndpoints` |
| `accessRules` | `toolAccessRules` | Modo de acceso, ventana de fechas, cupo, lista de espera, horarios/países, feature flag |
| `safetyPolicies` | `toolSafetyPolicies` | Riesgo, disclaimers, moderación, confirmaciones, allow-list de tools internas |
| `pwaConfig` | `toolPwaConfigs` | Manifest por herramienta |

`loadVersionConfig(toolVersionId)` (`lib/tools/repository.ts`) carga las siete
tablas en paralelo (`Promise.all`) y devuelve `FullVersionConfig` con cada
sección o `null` si la fila aún no existe (una versión recién creada por
rollback/duplicado siempre las tiene todas, porque se clonan juntas; ver §5).

Una herramienta puede estar `PUBLISHED` sirviendo `publishedVersionId`
mientras una versión `DRAFT` distinta se edita en paralelo para el siguiente
release: `ensureEditableDraftVersion()` (`lib/tools/service.ts`) es la función
que garantiza esto — si no existe ya un `DRAFT`, crea uno copiando la versión
publicada (o la que hubiera de base) y lo registra como `tools.draftVersionId`.
Todas las mutaciones de sección (`updateBranding`, `updateBehavior`, etc.)
exigen mediante `assertVersionIsDraft()` que la versión objetivo esté en
estado `DRAFT` — nunca se edita una versión publicada, aprobada o en
revisión.

## 2. Máquina de estados de la herramienta (`ToolStatus`)

Definida en `lib/tools/state-machine.ts` junto con la tabla de transiciones
`TOOL_STATE_TRANSITIONS`. `assertValidToolTransition(from, to)` es el único
punto de aplicación; cualquier transición fuera de tabla lanza
`ConflictError`. Una transición `from === to` siempre se permite como no-op
idempotente.

| Desde | Hacia (válido) |
|---|---|
| `DRAFT` | `CONFIGURATION_INCOMPLETE`, `INTERNAL_TESTING` |
| `CONFIGURATION_INCOMPLETE` | `DRAFT`, `INTERNAL_TESTING` |
| `INTERNAL_TESTING` | `DRAFT`, `UNDER_REVIEW` |
| `UNDER_REVIEW` | `INTERNAL_TESTING`, `APPROVED` |
| `APPROVED` | `SCHEDULED`, `PUBLISHED` |
| `SCHEDULED` | `PUBLISHED`, `APPROVED` |
| `PUBLISHED` | `PAUSED`, `SUSPENDED`, `ARCHIVED` |
| `PAUSED` | `PUBLISHED`, `SUSPENDED`, `ARCHIVED` |
| `SUSPENDED` | `PAUSED`, `ARCHIVED` |
| `ARCHIVED` | *(ninguna — estado terminal)* |

Este estado vive en `tools.status` y no lo muta directamente ninguna sección
de configuración: lo avanza `transitionToolStatus()` (llamado por
`pauseTool`/`resumeTool`/`suspendTool`/`archiveTool` y por `publishVersion`),
o indirectamente `advanceToolStatusForDraftProgress()`, que reacciona a
progresos de la versión en edición (§2.1).

### 2.1 Acoplamiento con el progreso de la versión en edición

`PRE_PUBLISH_TOOL_STATUSES` (`lib/tools/service.ts`) marca los estados de
`ToolStatus` que representan "todavía no se ha publicado nunca":
`DRAFT`, `CONFIGURATION_INCOMPLETE`, `INTERNAL_TESTING`, `UNDER_REVIEW`,
`APPROVED`, `SCHEDULED`. `advanceToolStatusForDraftProgress(toolId, target)`
solo actúa si el estado actual de la herramienta está en esa lista: cuando
`markVersionTesting`/`markVersionUnderReview`/`approveVersion` avanzan el
estado de la *versión*, intentan reflejar ese progreso en el estado de la
*herramienta* (`INTERNAL_TESTING`/`UNDER_REVIEW`/`APPROVED` respectivamente).
Si la herramienta ya está `PUBLISHED`/`PAUSED`/`SUSPENDED`/`ARCHIVED` (ya
publicó al menos una vez), esta función es un no-op deliberado: el estado de
"producto" refleja el ciclo de *servicio* (publicada/pausada/etc.), y no debe
regresar a un estado de preparación solo porque un borrador posterior está
siendo probado o revisado detrás de escena. Si la transición no es válida
desde el estado actual, también se ignora en silencio (`isValidToolTransition`,
sin lanzar).

## 3. Máquina de estados de la versión (`ToolVersionStatus`)

También en `lib/tools/state-machine.ts`, tabla `VERSION_STATE_TRANSITIONS`,
aplicada por `assertValidVersionTransition`:

| Desde | Hacia (válido) |
|---|---|
| `DRAFT` | `TESTING` |
| `TESTING` | `DRAFT`, `UNDER_REVIEW` |
| `UNDER_REVIEW` | `TESTING`, `APPROVED` |
| `APPROVED` | `SCHEDULED`, `PUBLISHED` |
| `SCHEDULED` | `PUBLISHED`, `APPROVED` |
| `PUBLISHED` | `SUPERSEDED`, `ROLLED_BACK` |
| `SUPERSEDED` | *(ninguna — terminal)* |
| `ROLLED_BACK` | *(ninguna — terminal, en la práctica nunca se estampa: ver nota abajo)* |

Funciones de `lib/tools/service.ts` que mueven este estado, cada una vía el
helper interno `transitionVersionStatus()` (que también es no-op si
`from === to`):

- `markVersionTesting(versionId, actorId)` → `TESTING`, y empuja
  `INTERNAL_TESTING` al lado herramienta.
- `markVersionUnderReview(versionId, actorId)` → `UNDER_REVIEW` (es el
  "enviar a revisión" de la UI; expuesto por
  `app/api/v1/admin/tools/[id]/versions/[versionId]/review/route.ts`, guardado
  por el permiso `tools.review`), y empuja `UNDER_REVIEW` al lado herramienta.
- `approveVersion(versionId, actorId)` → `APPROVED`, y empuja `APPROVED` al
  lado herramienta.
- `publishVersion(toolVersionId, actorId, { scheduledFor? })` → `SCHEDULED` si
  se pasa `scheduledFor`, o `PUBLISHED` si no. Ver §3.1 y §3.2.

### 3.1 `publishVersion`: publicación inmediata o programada

Antes de mover nada, revalida con `validateVersionForPublish()`
(`lib/tools/validation-publish.ts`, ver detalle abajo) y es **idempotente**:
si la versión ya es la `publishedVersionId` actual de la herramienta y ya está
`PUBLISHED`, retorna sin hacer nada. En caso contrario, dentro de una única
transacción:

1. Si la herramienta ya tenía una `publishedVersionId` distinta, esa versión
   anterior pasa a `SUPERSEDED` (con `supersededAt`).
2. La versión objetivo pasa a `SCHEDULED` (con `scheduledFor` y sin
   `publishedAt`) o a `PUBLISHED` (con `publishedAt = now()` y sin
   `scheduledFor`).
3. `tools.status` pasa al `targetToolStatus` correspondiente
   (`SCHEDULED`/`PUBLISHED`), `tools.publishedVersionId` se actualiza **solo**
   si la publicación es inmediata (una programación no cambia todavía qué
   versión sirve el tráfico), y `tools.draftVersionId` se limpia a `null`
   (deja de haber un borrador "actual"; la próxima edición creará uno nuevo
   vía `ensureEditableDraftVersion`).
4. Se inserta una fila en `toolPublications` con `action: "schedule"` o
   `"publish"`, quién publicó y cuándo.

### 3.2 Publicación programada y el cron

`processScheduledPublications()` recorre todas las `toolVersions` en estado
`SCHEDULED` y llama a `publishVersion(version.id, ...)` para cada una cuyo
`scheduledFor` ya pasó (`scheduledFor.getTime() <= Date.now()`) — es decir,
reutiliza el mismo camino de publicación inmediata una vez que llega la
fecha. Esta función la invoca `app/api/v1/cron/daily/route.ts`, el único cron
declarado en `vercel.json` (ver `docs/architecture.md` §9). El endpoint
`app/api/v1/admin/tools/[id]/versions/[versionId]/schedule/route.ts` es el
que expone `publishVersion(..., { scheduledFor })` a la UI.

### 3.3 Rollback: nunca se muta una versión antigua

`rollbackToVersion(toolId, targetVersionId, actorId)` no reescribe
`targetVersion` ni cambia su estado a `ROLLED_BACK` (por eso ese valor del
enum, aunque está declarado, no aparece estampado en la práctica): crea una
versión **nueva** (`versionNumber` siguiente, `status: "DRAFT"`,
`changeSummary: "Rollback a la versión N"`), le copia la configuración
completa de `targetVersion` con `copyVersionConfig()`, y llama a
`publishVersion()` sobre esa versión nueva. El resultado es que el historial
de versiones queda íntegro e inmutable — "volver atrás" es en realidad
"publicar de nuevo una configuración antigua bajo un número de versión
nuevo".

## 4. Otras operaciones de ciclo de vida

- **`pauseTool`/`resumeTool`/`suspendTool`/`archiveTool`** (`lib/tools/service.ts`)
  son envoltorios delgados sobre `transitionToolStatus()` que solo fijan el
  `to` de la transición (`PAUSED`/`PUBLISHED`/`SUSPENDED`/`ARCHIVED`) y, en el
  caso de `suspendTool`, exigen una razón (`reason: string`, no opcional) que
  queda en el evento de auditoría. `archiveTool` además estampa
  `tools.archivedAt`. Expuestos como
  `app/api/v1/admin/tools/[id]/{pause,resume,suspend,archive}/route.ts`.
- **`compareVersions(versionAId, versionBId)`**: carga ambas configuraciones
  completas con `loadVersionConfig` y, sección por sección (`branding`,
  `behavior`, `models`, `capabilities`, `accessRules`, `safetyPolicies`,
  `pwaConfig`), calcula el conjunto de claves cuyo valor difiere
  (`JSON.stringify` por campo, ignorando `id`/`toolVersionId`). Devuelve
  `Record<sección, { changed: string[] }>`. Expuesto en
  `app/api/v1/admin/tools/[id]/versions/compare/route.ts` y consumido por el
  selector de dos versiones en `LifecyclePanel` (§8).
- **`duplicateTool(toolId, newSlug, actorId)`**: valida que el slug nuevo esté
  libre (`assertSlugAvailable`), crea una herramienta nueva con la misma
  `category`/`team`/`responsibleUserId`, una versión `DRAFT` inicial
  (`changeSummary: "Duplicado de {slug-origen}"`), y le copia con
  `copyVersionConfig()` la configuración de la versión `draftVersionId` (o, si
  no hay borrador, `publishedVersionId`) de la herramienta origen. Expuesto en
  `app/api/v1/admin/tools/[id]/duplicate/route.ts`, con botón dedicado
  `components/admin/tools/DuplicateToolButton.tsx`.
- **`copyVersionConfig(fromVersionId, toVersionId, executor)`**
  (`lib/tools/repository.ts`) es el mecanismo común detrás de
  `ensureEditableDraftVersion`, `rollbackToVersion` y `duplicateTool`: carga la
  configuración completa de origen y hace un `insert` por cada sección
  presente en la versión destino, omitiendo `id`/`toolVersionId` de las filas
  copiadas. Nunca actualiza ni borra las filas de la versión origen — es lo
  que garantiza que una versión publicada permanezca inmutable para siempre,
  incluso después de que se haya creado un nuevo borrador o rollback a partir
  de ella.
- Cada mutación de ciclo de vida (`createTool`, `updateXxx`, transiciones,
  publicación, pausa/reanudación/suspensión/archivado, rollback,
  duplicación) termina con una llamada a `recordAuditEvent()`
  (`lib/audit/log.ts`), con `actorId`, `action` (p. ej.
  `tool.transition.paused`, `tool.version.publish`, `tool.duplicate`),
  `resourceType`/`resourceId` y, cuando aplica, `metadata`/`reason`.

## 5. Validación previa a publicar (`validateVersionForPublish`)

`lib/tools/validation-publish.ts` implementa el subconjunto automatizable de
un checklist previo a publicación; `publishVersion()` lo invoca siempre y
rechaza la publicación (`ValidationError` con la lista de errores) si no pasa.
Comprueba, en orden:

1. **Identidad**: existe `branding`, con `name`, `iconUrl` y `description` no
   vacíos.
2. **Comportamiento**: existe `behavior`, con `systemPrompt`, `welcomeMessage`
   y `scopeNotice` no vacíos. (Esta es la razón por la que
   `insertDefaultVersionScaffold()` deliberadamente **no** crea una fila de
   `toolBehavior` por defecto al crear la herramienta — su ausencia es
   exactamente la señal que este chequeo usa para bloquear una publicación
   incompleta.)
3. **Modelo**: existe `models`, con `providerId` y `primaryModelId`
   seleccionados, `budgetMonthlyCents > 0`, y el proveedor referenciado existe
   y está `enabled`.
4. **Acceso** y **seguridad**: deben existir filas de `accessRules` y
   `safetyPolicies` (no valida contenido específico, solo presencia).
5. **PWA condicional**: si `capabilities.pwa` está activo, exige que exista
   `pwaConfig` con `startUrl` y `scope`.
6. **Responsable**: `tools.responsibleUserId` debe estar asignado.
7. **Aviso de privacidad de la plataforma**: debe existir al menos un
   `legalDocuments` de tipo `privacy_policy`.
8. **Evaluaciones obligatorias**: por cada `evaluationSuites` de esta
   herramienta marcada `isMandatoryForPublish`, debe existir una
   `evaluationRuns` para *esta* versión con `status: "COMPLETED"` y
   `passed: 1`.

Los criterios editoriales o de juicio humano (calidad del contenido legal,
accesibilidad del render) quedan fuera de esta función a propósito — se
cubren con las pruebas de `tests/e2e` (accesibilidad axe) y con el propio
permiso `tools.review` en el flujo de aprobación.

## 6. Las siete secciones de configuración (`lib/validation/tools.ts`)

Cada sección tiene su propio esquema Zod, validado en la ruta de API antes de
llamar al `updateXxx` correspondiente en `lib/tools/service.ts`. `createTool`
usa además `slugSchema` (minúsculas/números/guiones, 3–80 caracteres).

### 6.1 `createToolSchema`

| Campo | Tipo/regla |
|---|---|
| `slug` | `slugSchema`: `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–80 caracteres |
| `name` | string, 1–120 |
| `shortName` | string, 1–40 |
| `description` | string, 1–280 |
| `category` | string, máx. 64, opcional |
| `team` | string, máx. 120, opcional |

### 6.2 `brandingSchema` (Identidad)

| Campo | Tipo/regla |
|---|---|
| `name` | string, 1–120 |
| `shortName` | string, 1–40 |
| `description` | string, 1–280 |
| `fullDescription` | string, máx. 5000, opcional |
| `tags` | array de string (máx. 40 c/u), máx. 20, default `[]` |
| `targetAudience` | string, máx. 200, opcional |
| `iconUrl` | URL, opcional o `""` |
| `logoUrl` | URL, opcional o `""` |
| `coverImageUrl` | URL, opcional o `""` |
| `primaryColor` | hex `#RRGGBB` |
| `secondaryColor` | hex `#RRGGBB` |
| `theme` | `"light" \| "dark" \| "system"` |

### 6.3 `behaviorSchema` (Comportamiento)

| Campo | Tipo/regla |
|---|---|
| `systemPrompt` | string, 1–20000 |
| `additionalInstructions` | string, máx. 20000, opcional |
| `tone` | string, máx. 64, opcional |
| `personality` | string, máx. 2000, opcional |
| `language` | string, máx. 10 |
| `welcomeMessage` | string, 1–2000 |
| `suggestedQuestions` | array de string (máx. 200 c/u), máx. 10, default `[]` |
| `errorMessage` | string, 1–500 |
| `closingMessage` | string, máx. 500, opcional |
| `scopeNotice` | string, 1–2000 |
| `limitations` | string, máx. 2000, opcional |
| `rules` | array de string (máx. 300 c/u), máx. 30, default `[]` |
| `additionalContext` | string, máx. 5000, opcional |
| `allowedProfileFields` | array de string (máx. 60 c/u), máx. 20, default `[]` |
| `exampleExchanges` | array de `{ user, assistant }` (máx. 1000/2000 c/u), máx. 10, default `[]` |
| `memoryMode` | `"DISABLED" \| "CONVERSATION_ONLY" \| "SESSION_ONLY" \| "USER_APPROVED" \| "STRUCTURED" \| "LONG_TERM"`, default `"DISABLED"` |

Como se explicó en §5, esta es la única de las siete tablas que **no** recibe
una fila por defecto al crear la herramienta (`insertDefaultVersionScaffold`
en `lib/tools/service.ts` la omite deliberadamente).

### 6.4 `modelsSchema` (Modelo)

| Campo | Tipo/regla |
|---|---|
| `providerId` | UUID, opcional |
| `primaryModelId` | UUID, opcional |
| `fallbackModelId` | UUID, opcional |
| `temperature` | número, 0–2 |
| `topP` | número, 0–1 |
| `maxOutputTokens` | entero, 1–32000 |
| `timeoutMs` | entero, 1000–120000 |
| `maxRetries` | entero, 0–5 |
| `streamingEnabled` | boolean |
| `contextTokenLimit` | entero, 500–2000000 |
| `fallbackPolicy` | `"on_error" \| "never" \| "on_timeout"` |
| `budgetMonthlyCents` | entero ≥ 0 |
| `perUserDailyMessageLimit` | entero ≥ 1 |
| `perUserMonthlyTokenLimit` | entero ≥ 1 |
| `conversationLimit` | entero ≥ 1 |
| `fileLimit` | entero ≥ 0 |
| `storageLimitBytes` | entero ≥ 0 |

`updateModels()` en `lib/tools/service.ts` convierte `temperature`/`topP` a
`String(...)` antes de escribir, porque en `db/schema/tools.ts` esas dos
columnas son `numeric` (Drizzle las tipa como string para preservar precisión
exacta, no `number`).

### 6.5 `capabilitiesSchema` (Capacidades)

| Campo | Tipo/regla |
|---|---|
| `text`, `streaming`, `voiceInput`, `voiceOutput`, `files`, `images`, `forms`, `quickReplies`, `menus`, `memory`, `history`, `rag`, `exportEnabled`, `documentGeneration`, `internalTools`, `externalApis`, `notifications`, `evaluations`, `escalation`, `feedback`, `pwa`, `deepLinks` | boolean (uno por interruptor) |
| `externalApiEndpoints` | array de `externalApiEndpointSchema`, máx. 10, default `[]` |

`externalApiEndpointSchema` (mismo archivo):

| Campo | Tipo/regla |
|---|---|
| `name` | `^[a-zA-Z0-9_]{1,40}$` |
| `url` | URL, debe empezar con `https://`, y el hostname no puede matchear `PRIVATE_HOSTNAME_PATTERN` (`localhost`, `127.`, `0.0.0.0`, `10.`, `172.16–31.`, `192.168.`, `169.254.`, `::1`) |
| `method` | `"GET" \| "POST"` |
| `description` | string, máx. 200, opcional |

El comentario en el propio archivo aclara el matiz de seguridad: solo un
admin con permiso puede fijar esta URL — el modelo o el usuario final nunca
la suministran ni la influyen —, así que el filtro de hostnames privados es
defensa en profundidad contra un admin comprometido o mal configurado
apuntando a infraestructura interna, no el cierre de un SSRF explotable desde
el chat.

### 6.6 `accessRulesSchema` (Acceso)

| Campo | Tipo/regla |
|---|---|
| `mode` | `"ALL_USERS" \| "SELECTED_USERS" \| "GROUPS" \| "ROLES" \| "INVITATION" \| "REQUEST_APPROVAL"` |
| `startsAt` | datetime ISO, opcional |
| `endsAt` | datetime ISO, opcional |
| `quota` | entero ≥ 0, opcional |
| `waitlistEnabled` | boolean |
| `gracePeriodDays` | entero ≥ 0 |
| `allowedHours` | `{ start: string, end: string }` o `null` |
| `allowedCountries` | array de código de país de 2 letras, default `[]` |
| `featureFlagKey` | string, máx. 80, opcional |

Ver §7 para cuáles de estos campos efectivamente gatean el acceso hoy en
`lib/tools/access.ts`.

### 6.7 `safetyPoliciesSchema` (Seguridad)

| Campo | Tipo/regla |
|---|---|
| `riskLevel` | `"LOW" \| "MEDIUM" \| "HIGH"` |
| `disclaimers` | array de string (máx. 500 c/u), default `[]` |
| `restrictedTopics` | array de string (máx. 200 c/u), default `[]` |
| `rejectionRules` | array de string (máx. 300 c/u), default `[]` |
| `inputModeration` | boolean |
| `outputModeration` | boolean |
| `riskSignals` | array de string (máx. 200 c/u), default `[]` |
| `contingencyMessage` | string, máx. 1000, opcional |
| `escalationPolicy` | string, máx. 2000, opcional |
| `ageRestriction` | entero, 0–21, opcional |
| `confirmationsRequired` | array de string (máx. 200 c/u), default `[]` |
| `allowedInternalTools` | array de string (máx. 80 c/u), default `[]` |
| `prohibitedActions` | array de string (máx. 300 c/u), default `[]` |

`allowedInternalTools` es el allow-list por nombre de herramienta interna que
consume `resolveAllowedToolNames()` en el pipeline (ver §9). `confirmationsRequired`
es la lista de nombres de tool interna que, aunque no lo exijan por defecto
(`requiresConfirmation` en su definición), esta herramienta en particular
quiere forzar a pasar por confirmación humana antes de ejecutarse (ver
`docs/architecture.md` §4.2).

### 6.8 `pwaConfigSchema` (PWA)

| Campo | Tipo/regla |
|---|---|
| `name` | string, 1–120 |
| `shortName` | string, 1–40 |
| `description` | string, 1–280 |
| `themeColor` | hex `#RRGGBB` |
| `backgroundColor` | hex `#RRGGBB` |
| `startUrl` | string, 1–200 |
| `scope` | string, 1–200 |
| `display` | `"standalone" \| "fullscreen" \| "minimal-ui" \| "browser"` |
| `orientation` | `"any" \| "portrait" \| "landscape"` |
| `shortcuts` | array de `{ name, url }`, máx. 4, default `[]` |
| `screenshots` | array de URL, máx. 8, default `[]` |
| `offlinePageUrl` | string, máx. 200 |
| `updatePolicy` | `"prompt" \| "auto"` |
| `subdomain` | string, máx. 80, opcional |
| `basePath` | string, máx. 120, opcional |
| `deepLinks` | array de string (máx. 200 c/u), default `[]` |

Detalle completo de cómo se sirve este manifest por herramienta
(`app/api/v1/catalog/[id]/manifest/route.ts`, gateado por `capabilities.pwa`)
en `docs/pwa.md`.

## 7. Reglas de acceso (`lib/tools/access.ts`)

`resolveCatalogState({ toolId, userId })` es la función central: calcula, para
un usuario y herramienta dados, uno de estos estados de catálogo
(`CatalogState`):

`AVAILABLE` · `ACTIVE` · `ACCESS_REQUESTED` · `APPROVAL_REQUIRED` ·
`INVITATION_ONLY` · `COMING_SOON` · `PAUSED` · `SUSPENDED` · `EXPIRED`

Orden de evaluación:

1. Si `tools.status` es `PAUSED` o `SUSPENDED`, ese es el estado final (gana
   sobre cualquier regla de acceso).
2. Si no está `PUBLISHED` (todavía en preparación), es `COMING_SOON`.
3. **Denegación explícita** (`hasExplicitDenial`): si existe una fila en
   `toolAssignments` con `decision: "DENY"` que aplique al usuario —
   directamente (`subjectType: "USER"`), por alguno de sus grupos
   (`groupMembers`) o por alguno de sus roles (`userRoles`) — el resultado es
   `SUSPENDED`. Esta comprobación se hace **antes** de mirar el modo de
   acceso general: una denegación administrativa siempre gana sobre un
   permiso más amplio (todos los usuarios, grupo o rol).
4. Ventana de fechas de la versión publicada (`toolAccessRules.startsAt`/
   `endsAt`): si `startsAt` es futuro → `COMING_SOON`; si `endsAt` ya pasó →
   `EXPIRED`.
5. **Allow explícito** (`hasExplicitAllow`, misma lógica que la denegación
   pero con `decision: "ALLOW"`): si aplica, el resultado es `ACTIVE` si el
   usuario ya activó la herramienta (`toolActivations` sin
   `deactivatedAt`) o `AVAILABLE` si no.
6. Si no hay allow/deny explícito, se evalúa `accessRule.mode`:
   - **`ALL_USERS`**: `ACTIVE`/`AVAILABLE` según activación — sin más
     restricciones.
   - **`INVITATION`**: requiere una fila en `accessRequests` con
     `status: "APPROVED"`; si no existe o no está aprobada →
     `INVITATION_ONLY`.
   - **`REQUEST_APPROVAL`, `SELECTED_USERS`, `GROUPS`, `ROLES`**: las cuatro
     comparten la misma rama de código — si hay una solicitud `APPROVED` →
     `ACTIVE`/`AVAILABLE`; si hay una `PENDING` → `ACCESS_REQUESTED`; si no
     hay ninguna → `APPROVAL_REQUIRED`. En la práctica, `SELECTED_USERS`,
     `GROUPS` y `ROLES` dependen de que un administrador cree las filas
     `toolAssignments` (`ALLOW`) correspondientes para que el usuario nunca
     llegue a esta rama (caerían en el paso 5); si no hay asignación, el
     usuario debe pasar por el mismo flujo de solicitud/aprobación que
     `REQUEST_APPROVAL`.

`canUserAccessTool(toolId, userId)` es el único booleano que consume el
pipeline conversacional (`docs/architecture.md` §4.1, paso 1): es `true`
únicamente cuando `resolveCatalogState` devuelve `ACTIVE` — es decir,
autorizado *y* activado por el propio usuario.

`resolveCatalogStates(toolIds, userId)` es la variante en lote para el
catálogo: hace las mismas consultas (herramientas, grupos, roles,
asignaciones ALLOW/DENY, activaciones, solicitudes) pero acotadas a la lista
completa de `toolIds` de una sola vez y luego repite exactamente la misma
lógica de decisión en memoria por herramienta — evita N+1 consultas al
renderizar el catálogo completo. Un test de integración
(`tests/integration/tools-lifecycle.test.ts`) verifica que ambas funciones
coincidan herramienta por herramienta.

Otras operaciones del módulo: `activateToolForUser`/`deactivateToolForUser`
(el toggle "agregar/quitar de mi lista", solo permitido si el estado resuelto
es `AVAILABLE` o `ACTIVE`) y `requestToolAccess` (crea o reactiva una fila
`accessRequests` en `PENDING`, solo si el estado resuelto es
`APPROVAL_REQUIRED` o `INVITATION_ONLY`; es idempotente si ya hay una
solicitud `PENDING`).

**Campos declarados pero no aplicados todavía**: `toolAccessRules.quota`,
`waitlistEnabled`, `gracePeriodDays`, `allowedHours` y `allowedCountries`
existen en el esquema Drizzle y en `accessRulesSchema`, se guardan y se
muestran/editan desde `AccessSection` en el admin, pero `lib/tools/access.ts`
no los lee en ningún punto de `resolveCatalogState`/`resolveCatalogStates` —
solo `startsAt`/`endsAt` afectan la decisión hoy. `featureFlagKey` tampoco se
resuelve contra ningún sistema de feature flags en el código actual. Esto es
un hueco de implementación real, no una omisión de este documento.

## 8. El editor administrativo (`app/admin/tools/**`, `components/admin/tools/**`)

`app/admin/tools/[id]/page.tsx` es un Server Component: resuelve el usuario
actual, carga la herramienta y llama a `ensureEditableDraftVersion()` para
garantizar que siempre hay un borrador editable, carga su `FullVersionConfig`
con `loadVersionConfig()`, la lista completa de versiones de la herramienta y
los proveedores de IA habilitados, y pasa todo a `ToolBuilder`
(`components/admin/tools/ToolBuilder.tsx`), un componente cliente.

`ToolBuilder` organiza la edición en siete pestañas (`TABS`), una por sección
de configuración, cada una delegada a su propio componente en
`components/admin/tools/sections/`:

| Pestaña | Componente |
|---|---|
| Identidad | `IdentitySection.tsx` |
| Comportamiento | `BehaviorSection.tsx` |
| Modelo | `ModelsSection.tsx` |
| Capacidades | `CapabilitiesSection.tsx` |
| Acceso | `AccessSection.tsx` |
| Seguridad | `SafetySection.tsx` |
| PWA | `PwaSection.tsx` |

Los formularios usan React Hook Form con resolvers de Zod contra los mismos
esquemas de `lib/validation/tools.ts`, y cada envío llama al endpoint
`PATCH` de sección correspondiente bajo
`app/api/v1/admin/tools/[id]/versions/[versionId]/route.ts` (o rutas
equivalentes), que a su vez invoca el `updateXxx` de `lib/tools/service.ts`.

Junto al editor, `LifecyclePanel` (`components/admin/tools/LifecyclePanel.tsx`)
concentra todo el control de ciclo de vida:

- **Probar**: envía un mensaje de prueba contra la versión en edición
  (`POST .../versions/[versionId]/test`) sin pasar por una conversación real.
- **Enviar a revisión** / **Aprobar** / **Publicar** / **Programar**: botones
  que llaman a `review`, `approve`, `publish` y `schedule` respectivamente;
  "Programar" despliega un campo `datetime-local` y llama a `publish` con
  `scheduledFor` en el cuerpo.
- **Pausar** / **Reanudar** / **Suspender** / **Archivar**: visibles
  condicionalmente según `toolStatus` (p. ej. "Pausar" solo si está
  `PUBLISHED`, "Reanudar" solo si está `PAUSED`), contra
  `app/api/v1/admin/tools/[id]/{pause,resume,suspend,archive}/route.ts`.
- **Versiones y comparación**: lista todas las versiones con su número y
  estado; permite seleccionar exactamente dos (checkbox, máximo dos a la vez)
  y pedir el diff a `GET .../versions/compare?a=&b=`, mostrando por sección
  qué campos cambiaron. Cada versión `SUPERSEDED` muestra un botón
  "Rollback" que llama a `POST /api/v1/admin/tools/[id]/rollback` con
  `targetVersionId`.
- Errores de validación (por ejemplo, los devueltos por
  `validateVersionForPublish` al intentar publicar) se muestran como lista en
  un `Alert` de advertencia.

`DuplicateToolButton.tsx` (usado en la vista de detalle) pide un nuevo slug al
usuario y llama a `POST /api/v1/admin/tools/[id]/duplicate`, redirigiendo al
editor de la herramienta recién creada.

## 9. Herramientas internas y APIs externas (capacidades en tiempo de chat)

Estas piezas viven en `lib/ai/tools/` y son las que el pipeline conversacional
(`docs/architecture.md` §4.2) realmente ofrece al modelo cuando una
herramienta las tiene habilitadas.

### 9.1 Herramientas internas (`lib/ai/tools/registry.ts`)

`INTERNAL_TOOLS` es un registro fijo de cinco definiciones
(`ToolDefinition`), cada una con `name`, `description`, `inputSchema` (Zod),
`parameters` (JSON Schema equivalente escrito a mano para el modelo),
`requiresConfirmation`, `riskLevel` y su `execute()`:

- **`calculator`**: evalúa una expresión aritmética simple.
  `requiresConfirmation: false`.
- **`datetime`**: devuelve fecha/hora actual en una zona horaria IANA
  opcional. `requiresConfirmation: false`.
- **`generate_text_document`**: genera un documento de texto plano a partir
  de título y contenido. `requiresConfirmation: false`; gateada además por
  `capabilities.documentGeneration` (ver §9.3).
- **`collect_form_input`**: siempre `requiresConfirmation: true`; su
  `execute()` nunca se ejecuta en operación normal — `resumeAfterToolConfirmation`
  en el pipeline trata este nombre como caso especial y usa directamente las
  respuestas de formulario enviadas por el usuario como resultado. Gateada
  además por `capabilities.forms`.
- **`knowledge_base_query`**: busca en la base de conocimiento de la
  herramienta activa (`retrieveRelevantChunks`, `lib/knowledge/retrieval.ts`)
  y requiere `context.toolId`. `requiresConfirmation: false`.

`listToolSpecsForLLM(allowedToolNames)` filtra el registro contra una lista de
nombres permitidos y devuelve los `ToolSpec` (`name`/`description`/`parameters`)
que efectivamente se adjuntan a la llamada al proveedor de IA.

### 9.2 APIs externas admin-configuradas (`lib/ai/tools/external.ts`)

Cada endpoint de `capabilities.externalApiEndpoints` se expone al modelo como
una tool con nombre `external_api__{name}` (prefijo `EXTERNAL_API_TOOL_PREFIX`)
y un único parámetro opcional `body` (objeto JSON libre) —el modelo **nunca**
puede suministrar ni influir la URL de destino, que ya quedó fija en tiempo de
configuración y validada contra hosts privados (§6.5). `executeExternalApiCall()`
nunca lanza: cualquier fallo de red, timeout o respuesta no-2xx se traduce en
`{ success: false, error }` para que el modelo pueda recuperarse, igual que
`executeInternalTool`. Límites duros: timeout de `8000 ms`
(`EXTERNAL_API_TIMEOUT_MS`) y truncado de la respuesta a `100_000` bytes
(`MAX_EXTERNAL_RESPONSE_BYTES`), leído en streaming desde el `body` de
`fetch()` para cortar antes de acumular más.

### 9.3 Cómo se resuelve el conjunto de tools permitido en el pipeline

`resolveAllowedToolNames(config)` (`lib/conversations/pipeline.ts`) es el
punto donde confluyen capacidades y política de seguridad para las
herramientas internas:

1. Si `capabilities.internalTools` es falso, o no hay `safetyPolicies`, no se
   permite ninguna (`[]`) — es el interruptor maestro.
2. En caso contrario, filtra `safetyPolicies.allowedInternalTools` (el
   allow-list por nombre) quedándose solo con nombres que:
   - existan en `INTERNAL_TOOLS`, y
   - si es `generate_text_document`, que además `capabilities.documentGeneration`
     esté activo;
   - si es `collect_form_input`, que además `capabilities.forms` esté activo.

`resolveExternalApiEndpoints(config)` es el equivalente para APIs externas:
devuelve `capabilities.externalApiEndpoints` únicamente si
`capabilities.externalApis` está activo, `[]` en caso contrario. Ambas listas
combinadas son las que arma `runToolRoundLoop` como `tools` disponibles para
el modelo en cada ronda (ver `docs/architecture.md` §4.2 para el bucle
completo, incluyendo el mecanismo de confirmación humana que usa
`safetyPolicies.confirmationsRequired` sobre estos mismos nombres).
