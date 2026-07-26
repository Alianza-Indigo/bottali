# Pruebas

Esta guía documenta la suite de pruebas real del proyecto: qué cubre cada capa,
cómo está configurada y cómo correrla localmente y en integración continua.

## 1. Resumen

La suite sigue una pirámide de pruebas clásica, con tres capas transversales
adicionales que no encajan en la pirámide vertical pero son igual de
obligatorias en CI:

```
              ┌───────────────────────────┐
              │   E2E (Playwright)        │  tests/e2e/**
              │   navegador real,         │
              │   servidor real           │
              ├───────────────────────────┤
              │   Integración (Vitest)    │  tests/integration/**
              │   Postgres real           │
              ├───────────────────────────┤
              │   Unitarias (Vitest)      │  tests/unit/**
              │   funciones puras         │
              └───────────────────────────┘

  Capas transversales, corridas por Playwright junto al e2e:
  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐
  │  Seguridad  │  │  Accesibilidad   │  │  Rendimiento  │
  │ tests/      │  │  tests/          │  │  tests/       │
  │ security/   │  │  accessibility/  │  │  performance/ │
  └─────────────┘  └──────────────────┘  └───────────────┘
```

En total, al momento de escribir esta guía la suite tiene **114 pruebas**:
19 unitarias, 55 de integración, 16 e2e, 9 de seguridad, 5 de accesibilidad y
10 de rendimiento.

La regla general: unitarias no tocan la base de datos ni la red; integración
corre contra una Postgres real (la misma que usarías en desarrollo) pero sin
levantar un servidor HTTP; e2e/seguridad/accesibilidad/rendimiento corren
todas contra un servidor Next.js real (`next start`) manejado por Playwright,
con un navegador Chromium real.

## 2. Pruebas unitarias

Motor: [Vitest](https://vitest.dev/), configurado en `vitest.config.ts`:

```ts
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
    // Hace que `import "server-only"` resuelva a su export no-op (como hace el
    // bundler de Next.js) en vez del export que lanza por defecto, que asume una
    // condición de bundler que Node/Vitest no configuran de otro modo.
    conditions: ["react-server"],
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
```

Dos detalles de esta configuración son importantes para entender por qué el
código de la aplicación (que usa `import "server-only"` en varios módulos de
`lib/`) puede importarse directamente en un test sin un bundler de por medio:
la condición `"react-server"` engancha el mismo export no-op que usa el propio
compilador de Next, en vez del export por defecto del paquete `server-only`
(que lanza una excepción si detecta que corre fuera de un Server Component).
`tests/setup.ts` carga `.env.local`/`.env` con `dotenv` y fija
`APP_ENV=development` si no está definido (el esquema de `lib/env.ts` no tiene
un valor `"test"`, así que `"development"` es el más cercano semánticamente).

Qué cubre (`tests/unit/`):

| Archivo | Qué verifica |
|---|---|
| `chat-drafts.test.ts` | Persistencia de borradores de chat (§22/§36) cuando IndexedDB no está disponible: `loadDraft`/`saveDraft`/`clearDraft` resuelven en vez de rechazar. |
| `chunking.test.ts` | `chunkText`: un solo fragmento para texto corto, ningún fragmento para texto vacío, división respetando `maxChars`, solapamiento entre fragmentos consecutivos. |
| `mime-sniff.test.ts` | `sniffMimeType`: detección por *magic bytes* de PDF, PNG, docx (contenedor zip), WebM/Ogg/WAV/MP3 (para las grabaciones de voz), y rechazo de contenido cuyo tipo declarado no coincide con sus bytes reales (incluye un ejecutable disfrazado de PDF). |
| `tool-result-wrapping.test.ts` | `wrapToolResultForModel`: el resultado corto se envuelve sin cambios con el framing "esto son datos, no instrucciones"; un resultado que excede el límite se trunca para que una sola llamada a herramienta no agote la ventana de contexto. |

Cómo correrlas:

```bash
npm run test         # una sola pasada
npm run test:watch   # modo watch
```

## 3. Pruebas de integración

También corren sobre Vitest (`npm run test:integration` usa el mismo
`vitest.config.ts`, apuntando a `tests/integration` en vez de `tests/unit`),
pero a diferencia de las unitarias **requieren una Postgres real** —la misma
`DATABASE_URL` que usa el resto de la app— y ejercitan la capa de servicio
completa (`lib/conversations/*`, `lib/tools/*`, `lib/admin/*`, etc.) en vez de
funciones puras aisladas.

Patrón común en estos archivos: `beforeAll` crea usuarios de prueba con
`hashPassword` + inserts directos con Drizzle, `afterAll` los borra
(`db.delete(users).where(...)`, `db.delete(tools).where(...)`), y cada test
que necesita una herramienta publicada usa el fixture
`createPublishedTestTool` (ver sección 5) en vez de repetir el asistente de
publicación paso a paso. No hay un framework de transacciones/rollback
automático: la limpieza es manual, por eso cada suite borra explícitamente lo
que creó.

| Archivo | Qué verifica |
|---|---|
| `admin-conversation-content.test.ts` | Acceso excepcional de admin a contenido de conversaciones (§30): rechaza una razón demasiado corta; una lectura autorizada devuelve solo campos minimizados (`id`/`role`/`content`/`createdAt`, sin costo/modelo/moderación) y queda auditada con la razón exacta sin que el contenido se filtre a los metadatos de auditoría; `listConversationsForAdmin` nunca incluye contenido de mensajes, solo metadatos. |
| `capabilities.test.ts` | Las capacidades de una herramienta realmente condicionan el comportamiento: `streaming=false` colapsa la respuesta en un solo delta; `documentGeneration` habilita `generate_text_document` independientemente del allow-list de herramientas internas y genera un archivo real descargable ligado al mensaje; `notifications` crea (o no) una notificación real; `history=false` excluye turnos previos del contexto; adjuntar un archivo lo vincula al mensaje; `escalation` marca la conversación y audita el evento solo si la capacidad está activa; `forms` pausa la generación hasta recibir `collect_form_input`; `externalApis` solo permite llamar el endpoint nombrado configurado por el admin, nunca una URL provista por el modelo; `evaluations` condiciona la creación de un conjunto de evaluación. |
| `conversation-pipeline.test.ts` | El pipeline real de conversación: envía un mensaje, transmite los *deltas* y persiste ambos mensajes; `reserveUsage` es idempotente (no reserva doble); un mensaje marcado por moderación de entrada se bloquea sin llamar al modelo; la transmisión se detiene si el cliente aborta; se puede regenerar una respuesta dejando el mensaje original en el historial; se acepta feedback sobre un mensaje; una conversación se puede archivar, restaurar y borrar. |
| `files.test.ts` | Ciclo de vida de archivos con el adaptador de almacenamiento en disco local: sube, descarga y borra un archivo de punta a punta; rechaza la descarga de otro usuario; rechaza un descuadre entre el tamaño declarado y el real; rechaza una subida sobredimensionada o de tipo MIME no permitido ya en la iniciación. |
| `jobs.test.ts` | Proveedores de trabajos asíncronos: `SyncJobProvider` ejecuta el trabajo en línea; `CronPollingJobProvider` deja el trabajo en `QUEUED` hasta que corre `processPendingJobs`; reintenta un trabajo fallido hasta `maxAttempts` y luego lo mueve a `DEAD_LETTER`; deduplica llamadas de encolado que comparten la misma clave de idempotencia; re-ejecutar un trabajo ya terminal es un no-op; `getJobStatus` devuelve `null` para un id desconocido. |
| `knowledge.test.ts` | Ingesta de base de conocimiento: sube -> extrae -> fragmenta -> genera embeddings -> indexa un documento markdown de punta a punta; rechaza un documento cuyo tipo MIME declarado no coincide con su contenido real; reindexar un documento reemplaza sus fragmentos. |
| `performance.test.ts` | Recuperación de fragmentos relevantes de la base de conocimiento (RAG) y el ciclo completo de carga de un archivo, ambos en un tiempo acotado, contra Postgres real. |
| `tool-calling.test.ts` | El ciclo de llamado a herramientas internas: ejecuta una herramienta permitida a mitad de conversación y refleja su resultado en la respuesta; no deja que el modelo llame una herramienta fuera del allow-list de esa versión; una conversación sin la capacidad `internalTools` se comporta exactamente igual que antes (sin herramientas adjuntas). |
| `tool-confirmations.test.ts` | Ciclo humano-en-el-bucle de confirmación de herramientas (§15) — ver detalle abajo. |
| `tools-lifecycle.test.ts` | Ciclo de vida completo de una herramienta: crear con versión `DRAFT` y configuración scaffolded; rechazar la publicación de un borrador incompleto; aceptar y publicar un borrador completamente configurado; resolver el estado de catálogo y soportar activación (incluida la variante *batched* `resolveCatalogStates` usada por el catálogo/API para evitar N+1); correr un mensaje de prueba contra el proveedor falso; pausar, reanudar, suspender y revertir una versión; crear un nuevo borrador editable sin tocar la versión publicada. |

### En detalle: `tool-confirmations.test.ts`

Ejercita el ciclo real de pausa → aprobar/rechazar → reanudar a través del
pipeline real (`sendMessage` + `resumeAfterToolConfirmation`), no solo las
funciones auxiliares aisladas. Casos cubiertos:

- Una herramienta marcada `confirmationsRequired` pausa la generación en vez
  de auto-ejecutarse: no hay mensaje de asistente todavía y la reserva de
  presupuesto queda en `HELD` (no reconciliada ni liberada), que es lo que la
  hace reanudable.
- Aprobar reanuda la generación, **ejecuta de verdad** la herramienta (se
  comprueba que `6*7` produce `42` en el contenido del mensaje) y finaliza el
  mensaje; la reserva pasa a `RECONCILED` y el *snapshot* de estado de
  generación se limpia (solo hace falta mientras está `PENDING`).
- Rechazar le informa al modelo que el usuario declinó y deja que el turno
  termine con normalidad, sin ejecutar la herramienta.
- Una confirmación expirada no puede reanudarse (`rejects.toThrow(/expiró/)`)
  y libera su reserva.
- El barrido por cron (`expireStalePendingConfirmations`) expira
  confirmaciones pendientes obsoletas y libera sus reservas.
- Enviar un mensaje nuevo en la misma conversación expira automáticamente una
  confirmación pendiente obsoleta, sin bloquear el mensaje nuevo.
- Una doble aprobación concurrente ejecuta la herramienta **exactamente una
  vez**: la prueba lanza dos `resumeAfterToolConfirmation` en paralelo contra
  la misma fila y verifica que solo una se resuelve (la otra rechaza con "ya
  fue resuelta") y que solo existe un mensaje de asistente — la prueba explícita
  de que la reclamación es atómica (`UPDATE ... WHERE status='PENDING'
  ... RETURNING`) y no un patrón leer-y-luego-escribir.
- Una carrera entre aprobación y un mensaje nuevo que la supera nunca deja una
  reserva inconsistente: el estado final es siempre `APPROVED`+`RECONCILED` o
  `EXPIRED`+`RELEASED`, nunca una combinación mixta.

### En detalle: `admin-conversation-content.test.ts`

Cubre `conversations.content.read` (§30), un permiso separado de
`conversations.metadata.read`: exige una razón real (rechaza una demasiado
corta con `ValidationError`), y una lectura exitosa devuelve solo
`id`/`role`/`content`/`createdAt` por mensaje (nada de costo, tokens, modelo o
moderación), queda registrada en `auditEvents` con la razón exacta, y el
contenido sensible nunca aparece serializado en los metadatos de esa
auditoría. `listConversationsForAdmin` se verifica por separado para
confirmar que nunca incluye contenido, solo un conjunto fijo de campos de
metadatos.

Correr la suite:

```bash
npm run test:integration
```

## 4. Pruebas end-to-end

Motor: [Playwright](https://playwright.dev/), configurado en
`playwright.config.ts`:

- `testDir: "./tests"` con `testMatch` apuntando a tres carpetas a la vez:
  `e2e/**/*.spec.ts`, `accessibility/**/*.spec.ts` y `security/**/*.spec.ts`
  — por eso un único comando (`npm run test:e2e`) corre las tres capas
  juntas.
- `fullyParallel: false`, `workers: 1`: la suite comparte estado real en
  Postgres (usuarios demo, una herramienta publicada, el limitador de tasa de
  login), así que correr en paralelo introduciría condiciones de carrera
  entre pruebas.
- `globalSetup: "./tests/e2e/global-setup.ts"` (ver detalle abajo).
- `webServer`: levanta el servidor con `npm run start` en el puerto
  `E2E_PORT` (por defecto `3100`), con `reuseExistingServer: false` siempre
  — nunca reutiliza un proceso `next start` que ya esté escuchando en ese
  puerto, para evitar servir HTML de un build `.next` obsoleto e
  incompatible (causa de 400 intermitentes en chunks). El script
  `pretest:e2e` (`next build`) corre automáticamente antes por convención de
  npm.
- El `webServer` fuerza `NODE_OPTIONS: ""`: `NODE_OPTIONS=--conditions=react-server`
  (necesario para que `global-setup.ts` pueda importar código de servidor con
  `import "server-only"` fuera del bundler de Next) no debe filtrarse al
  proceso real de Next, que ya resuelve `server-only` correctamente por su
  cuenta — heredar esa bandera rompe sutilmente la resolución de módulos del
  servidor de producción.
- `permissions: ["microphone"]` y, en `launchOptions.args`:
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` —
  alimenta un flujo de audio sintético a `getUserMedia` y auto-concede el
  permiso, de modo que el flujo real de entrada de voz basado en
  `MediaRecorder` puede probarse sin cabeza (headless) y sin hardware de
  audio del sistema operativo.
- `projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]`:
  un único navegador.

### `tests/e2e/global-setup.ts`

Corre una vez antes de toda la suite (e2e + accesibilidad + seguridad, ya que
comparten `globalSetup`) y siembra, contra la Postgres real de desarrollo,
todo lo que la suite necesita:

1. `seedRolesAndPermissions(db)` — catálogo RBAC (roles y permisos).
2. `syncProvidersFromEnv(db)` — sincroniza el proveedor de IA falso (y
   cualquier otro configurado por entorno).
3. `seedDefaultLegalDocuments(db)` — aviso de privacidad por defecto.
4. `seedDemoData(db)` — usuarios de demostración, ya con el correo
   verificado (para que el login funcione sin bandeja de entrada real).
5. Busca al usuario demo `user@demo.crisis.local` y, con
   `createPublishedTestTool(demoUser.id, { pwa: true, voice: true })`, publica
   **una** herramienta que ese usuario puede abrir y con la que puede
   conversar (con PWA y voz habilitadas, para que `pwa.spec.ts` y
   `voice.spec.ts` tengan algo real que probar).
6. Escribe el slug de esa herramienta en `tests/e2e/.e2e-context.json`
   (`E2E_CONTEXT_PATH`), que los specs leen después vía
   `readE2eContext()` de `helpers.ts`.

Es idempotente y seguro de re-correr: cada paso de siembra (roles,
proveedores, documentos legales, usuarios demo) hace *upsert*/verifica
existencia antes de insertar, y crear la herramienta usa un slug generado con
`randomUUID()` en cada corrida, así que nunca choca con una anterior.

### El patrón `loginAs` y MFA

`tests/e2e/helpers.ts` expone `loginAs(page, email, password)`, usado por
casi todos los specs. Las cuentas demo de administrador
(`superAdmin`, `toolAdmin`) tienen MFA pre-habilitado en el seed
(`DEMO_MFA_SECRET` en `db/seed/demo.ts`), así que iniciar sesión con ellas
siempre muestra el segundo factor; la cuenta `user` no tiene MFA.

`loginAs` no sabe de antemano si la cuenta que recibe tiene MFA o no, así que
en vez de comprobar con algo como `mfaInput.isVisible({ timeout })`
—que forzaría a esperar el timeout completo en cada login sin MFA, ya que
`isVisible` con `timeout` en Playwright espera a que el elemento aparezca o
al timeout, no puede "adivinar" que nunca va a aparecer— usa una carrera real
entre dos resultados posibles:

```ts
const outcome = await Promise.race([
  page.waitForURL(/\/dashboard/).then(() => "dashboard" as const),
  mfaInput.waitFor({ state: "visible" }).then(() => "mfa" as const),
]);
```

Una cuenta sin MFA llega a `/dashboard` casi de inmediato y gana la carrera;
una cuenta con MFA nunca navega a `/dashboard` sin antes pasar por el
segundo factor, así que en su caso gana la espera por el input de MFA. Si
`outcome === "mfa"`, calcula un código TOTP real y vigente a partir del
secreto conocido de la cuenta (`generateTotpCode`, el mismo primitivo que usa
una app autenticadora de verdad) en vez de necesitar un atajo especial solo
para pruebas, lo rellena, confirma, y espera la navegación final a
`/dashboard`. El resultado: la mayoría de los logins (cuentas sin MFA) no
pagan ningún costo de espera adicional, y los que sí tienen MFA se resuelven
tan pronto el input aparece, sin un `sleep` fijo "por si acaso" que ralentice
toda la suite.

### Qué flujos cubre `tests/e2e/`

| Archivo | Qué cubre |
|---|---|
| `admin.spec.ts` | Un super admin entra al panel y ve la navegación administrativa; puede crear una herramienta desde el asistente; puede crear un usuario que recibe un correo para definir su contraseña; un usuario final es redirigido fuera del panel administrativo. |
| `auth.spec.ts` | Registro válido crea la cuenta y permite iniciar sesión de inmediato; login con credenciales inválidas muestra un error genérico; login con credenciales demo lleva al dashboard autenticado. |
| `catalog-chat.spec.ts` | Un usuario activa una herramienta publicada del catálogo y conversa con ella. |
| `form-input.spec.ts` | Un usuario completa un formulario solicitado por el asistente (`collect_form_input`) y la respuesta lo refleja. |
| `pwa.spec.ts` | Los assets del shell PWA (manifest, íconos, página offline) responden; el manifest de la plataforma referencia los tres íconos requeridos; el service worker se registra y queda activo en el navegador; una herramienta publicada con PWA habilitada expone su propio manifest dinámico. |
| `tool-builder-forms.spec.ts` | Los formularios de las 7 secciones del editor de herramientas (migradas a react-hook-form) persisten sus cambios tras recargar la página — ver detalle abajo. |
| `tool-confirmation.spec.ts` | Un usuario ve la tarjeta de confirmación de una herramienta y, al aprobarla, la herramienta se ejecuta de verdad. |
| `voice.spec.ts` | Un usuario graba voz, la transcribe, la edita y escucha la respuesta (usa el flujo de audio falso configurado en `playwright.config.ts`). |

### En detalle: `tool-builder-forms.spec.ts`

Cubre la migración de las secciones de edición de herramientas del panel
admin (antes `useState` plano, ahora react-hook-form): llena cada sección,
guarda, **recarga la página completa** (forzando un `loadVersionConfig` fresco
del servidor) y comprueba que los valores realmente persistieron a través del
endpoint `PATCH` — no solo que los componentes compilan o renderizan. Ejercita
cada patrón no trivial de RHF usado en las 7 secciones en una sola prueba:
`register()` plano (Identidad), un campo de texto "un ítem por línea" sobre un
array de strings respaldado por `Controller` (Comportamiento/Seguridad), un
checkbox siempre forzado a activo y deliberadamente **no registrado**
(el campo `text` de Capacidades, para probar que su valor por defecto se
envía igual), y un `useFieldArray` (los `externalApiEndpoints` de
Capacidades).

Correr la suite completa (e2e + accesibilidad + seguridad):

```bash
npm run test:e2e
```

## 5. El fixture `createPublishedTestTool`

`tests/fixtures/tool-factory.ts` expone
`createPublishedTestTool(actorId, overrides)`, usado tanto por
`global-setup.ts` como por la mayoría de las pruebas de integración que
necesitan una herramienta publicada. Evita que cada prueba reimplemente el
asistente completo de publicación paso a paso.

Lleva una herramienta desde cero hasta `PUBLISHED` llamando en secuencia a
las funciones reales del servicio (`lib/tools/service`):
`createTool` → `updateBranding` → `updateBehavior` → `updateModels` →
`updateCapabilities` → `updateAccessRules` → `updateSafetyPolicies` →
`updatePwaConfig` → `markVersionTesting` → `markVersionUnderReview` →
`approveVersion` → `publishVersion`. El modelo/proveedor se toma del
proveedor `llm:fake` ya sembrado por `syncProvidersFromEnv`.

`overrides` acepta, entre otros: `memoryMode`, `rag`, `pwa`, `voice`,
`internalTools` (lista de nombres de herramientas internas permitidas —
además enciende `capabilities.internalTools` si no está vacía),
`confirmationsRequired` (nombres de herramientas que exigen confirmación
humana, §15), `history`, `streaming`, `documentGeneration`, `files`,
`images`, `escalation`, `notifications`, `forms`, `deepLinks`,
`evaluations`, `externalApis` y `externalApiEndpoints`. Todo lo no
especificado usa un valor por defecto razonable (por ejemplo `streaming:
true`, `history: true`, el resto de capacidades en `false`), así cada prueba
solo declara las capacidades que realmente le importan.

## 6. Pruebas de seguridad

Corren con Playwright, dentro del mismo `npm run test:e2e`
(`testMatch: "security/**/*.spec.ts"`), contra el servidor real.

- **`csrf.spec.ts`** (§29, protección de doble cookie en `middleware.ts`):
  una solicitud mutante sin el header `X-CSRF-Token` es rechazada con 403 y
  `CSRF_VALIDATION_FAILED` aunque la cookie de sesión sea válida — se simula
  usando `page.request`, que comparte las cookies del contexto del navegador
  pero (a diferencia del `apiFetch` propio de la app) no repite
  automáticamente la cookie CSRF como header, exactamente la forma que
  tomaría una solicitud falsificada entre sitios; la misma solicitud con el
  token CSRF correcto (leído de la cookie `crisis_csrf`) tiene éxito; el
  login no requiere token CSRF porque todavía no existe sesión.
- **`headers.spec.ts`**: las páginas públicas y las respuestas de la API
  llevan las cabeceras esperadas (`Content-Security-Policy` con
  `default-src 'self'` y `frame-ancestors 'none'`, sin `unsafe-eval`;
  `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`;
  `Referrer-Policy: strict-origin-when-cross-origin`;
  `Strict-Transport-Security`); un endpoint protegido (`/api/v1/me`) rechaza
  sin sesión (401); el manifest dinámico por herramienta exige sesión;
  `health/live` y `health/ready` son públicos pero `health/dependencies`
  exige permisos de admin (401 sin ellos); cada respuesta incluye un
  `x-request-id` que coincide con el de la petición (para trazabilidad de
  correlación).

## 7. Accesibilidad

`tests/accessibility/a11y.spec.ts` usa
[`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright)
(declarado en `devDependencies` de `package.json`) con las etiquetas
`["wcag2a", "wcag2aa", "wcag22aa"]` — un smoke pass de WCAG 2.2 AA (§26/§45).
El test falla si hay violaciones con impacto `serious` o `critical`
(imprime el detalle en JSON por consola antes de fallar para facilitar el
diagnóstico); axe por sí solo no puede certificar cumplimiento AA completo
(cosas como el orden de lectura o las trampas de foco siguen requiriendo
revisión manual), pero detecta de forma confiable etiquetas faltantes,
fallos de contraste y ARIA inválido.

Páginas verificadas: `/login`, `/register`, el dashboard autenticado (con la
cuenta demo `user`), el catálogo de herramientas (`/tools`) y la página de
configuración de accesibilidad (`/accessibility`).

## 8. Rendimiento

`tests/performance/` corre con una configuración de Playwright separada,
`playwright.performance.config.ts` (`npm run test:performance`), deliberadamente
distinta de `playwright.config.ts`: los umbrales de rendimiento son
inherentemente más ruidosos/sensibles al entorno que las aserciones
funcionales, y una corrida de rendimiento lenta no debe bloquear la suite
principal de e2e/accesibilidad/seguridad (ni viceversa). Usa un puerto
distinto (`3101` por defecto) y el mismo `global-setup.ts`.

| Archivo | Qué mide | Umbral(es) |
|---|---|---|
| `01-page-timings.spec.ts` | Tiempo de carga real de `/login`, navegación al catálogo, apertura de una herramienta de chat, y el dashboard administrativo (varias consultas agregadas), usando la Navigation Timing API del navegador (TTFB y evento `load`). | `ttfb < 3000 ms`, `loadEvent < 6000 ms`. Umbrales deliberadamente generosos: corre en un contenedor compartido e impredecible, no en hardware de producción representativo — son techos de cordura que detectan una regresión real (p. ej. un N+1 reintroducido), no un SLA. |
| `02-streaming.spec.ts` | Tiempo hasta el primer byte (TTFB) de una respuesta en streaming real: mide desde que se envía un mensaje de chat hasta que aparece el primer indicio del streaming NDJSON (el placeholder "Generando…"), con una sesión de navegador autenticada real. | `< 8000 ms`. |
| `03-pagination.spec.ts` | Que `GET /api/v1/conversations` y `GET /api/v1/notifications` respetan `limit`/`offset` reales. | (verificación funcional de paginación, sin umbral de tiempo). |
| `04-load.spec.ts` | Concurrencia real con [`autocannon`](https://www.npmjs.com/package/autocannon) (no un navegador) contra `/api/v1/health/live` (20 conexiones, 5 s) y `/login` (10 conexiones, 5 s); y el limitador de tasa de login: 40 intentos concurrentes desde la misma IP de loopback deben producir al menos una respuesta `429`. | Salud: `errors === 0`, `non2xx === 0`, `latency.p99 < 2000 ms`. Catálogo/login: `errors === 0`, `non2xx === 0`. Rate limiter: `rateLimited > 0` de 40 intentos (el límite configurado es 20 cada 15 min por IP). El nombre del archivo empieza con `04-` a propósito: agota el presupuesto del limitador de tasa, que es compartido por toda la sesión del `webServer`, así que debe ser el último archivo en correr o "envenenaría" el `loginAs()` de las demás pruebas de rendimiento. |

Esta suite corre en CI pero **no bloquea el merge** (ver sección siguiente).

## 9. Integración continua

`.github/workflows/ci.yml` define un único workflow, `CI`, disparado en
`push` a cualquier rama (`branches: ["**"]`) y en cada `pull_request`, con
`concurrency` configurada para cancelar una corrida anterior en la misma
rama cuando llega una nueva. Todos los jobs comparten variables de entorno
fijas y no secretas (`APP_SECRET_KEY`, `DATABASE_URL`, `ENABLE_VOICE`,
`STT_PROVIDER=fake`, `TTS_PROVIDER=fake`, `ENABLE_FILES=true`,
`ENABLE_PWA=true`, `ENABLE_ANALYTICS=true`, etc.) para que el esquema de
`lib/env.ts` valide igual en todos lados.

Jobs, todos corriendo en paralelo entre sí (sin dependencias declaradas
entre jobs):

| Job | Levanta Postgres | Qué corre | Bloquea el merge |
|---|---|---|---|
| `lint-typecheck` | No | `npm run lint`, `npm run typecheck` | Sí |
| `unit` | No | `npm run test` | Sí |
| `integration` | Sí (servicio `postgres:16`) | `npm run db:migrate`, `npm run test:integration` | Sí |
| `e2e` | Sí (servicio `postgres:16`) | `npx playwright install --with-deps chromium`, `npm run db:migrate`, `npm run test:e2e` (e2e + seguridad + accesibilidad) | Sí |
| `performance` | Sí (servicio `postgres:16`) | `npx playwright install --with-deps chromium`, `npm run db:migrate`, `npm run test:performance` | **No** (`continue-on-error: true`) |

`lint-typecheck` y `unit` nunca abren una conexión real a Postgres (el
paquete `postgres` se conecta de forma perezosa y esas suites no tocan la
base de datos), por eso no declaran el servicio `postgres`. Los otros tres
jobs sí lo declaran, cada uno con su propio contenedor `postgres:16`
efímero con chequeo de salud (`pg_isready`) antes de correr las migraciones.
El job de e2e corre las tres capas transversales (seguridad y accesibilidad
incluidas) porque comparten `testMatch` en `playwright.config.ts` con las
pruebas e2e propiamente dichas. El runner de GitHub Actions no trae un
navegador preinstalado (a diferencia del sandbox de desarrollo del
proyecto), así que ese job y el de rendimiento instalan Chromium
explícitamente con `npx playwright install --with-deps chromium`; el
resolutor de ruta de ejecutable en `playwright.config.ts`
(`resolvePlaywrightExecutablePath`) cae de vuelta a la resolución por
defecto de Playwright cuando la ruta del sandbox no existe.

El job `performance` corre en cada push, así que las regresiones de
rendimiento quedan visibles, pero una corrida mala en un runner compartido
e impredecible no debe bloquear un merge del mismo modo que sí lo haría un
fallo funcional o de seguridad real — de ahí `continue-on-error: true`.

## 10. Cómo correr todo localmente

```bash
cp .env.example .env.local   # completar con una base Postgres local
npm install
npm run db:migrate
npm run db:seed              # roles, proveedores y, en desarrollo, usuarios/
                              # herramientas de demostración

npm run lint                 # ESLint
npm run typecheck            # tsc --noEmit

npm run test                 # unitarias (Vitest, sin DB)
npm run test:integration     # integración (Vitest, requiere la misma Postgres local)

npm run test:e2e             # build (pretest:e2e) + Playwright:
                              #   e2e, seguridad, accesibilidad
npm run test:performance      # build (pretest:performance) + Playwright:
                              #   rendimiento (config separada, puerto 3101)

npm run build                # build de producción
```

`test:e2e` y `test:performance` corren con
`NODE_OPTIONS=--conditions=react-server` (necesario para que
`global-setup.ts` pueda importar código de servidor fuera del bundler de
Next); ambos scripts tienen un pre-hook de npm (`pretest:e2e`/
`pretest:performance`) que corre `next build` automáticamente antes, y ambos
levantan su propio servidor real vía `webServer` — no hace falta tener
`npm run dev` corriendo aparte.
