# API (v1)

Esta guía documenta cada endpoint expuesto bajo `app/api/v1/**` — el contrato
real de la aplicación, no una API pública versionada de forma independiente:
el frontend de esta misma app es el único cliente soportado.

## 1. Convenciones generales

### Base path

Todas las rutas cuelgan de `/api/v1`. No existe otra versión activa.

### Formato de error

Cualquier ruta que falle responde con el mismo sobre JSON
(`lib/validation/http.ts`, función `handleApiError`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Datos inválidos.", "issues": { "...": "..." } } }
```

- `code` — string estable (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
  `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, etc.),
  deriva del subtipo de `AppError` lanzado (`lib/utils/errors.ts`).
- `message` — texto en español, seguro de mostrar al usuario.
- `issues` — solo presente en errores de validación Zod (`ValidationError`);
  es la salida de `.flatten()`.
- Errores no controlados (`INTERNAL_ERROR`, 500) además incluyen `requestId`
  para correlacionar con logs/Sentry, y nunca filtran el stack trace al
  cliente.

Los cuerpos de solicitud se parsean con `parseJsonBody()`, que valida contra
un schema Zod y lanza `ValidationError` (400) ante JSON inválido o datos que
no cumplen el schema.

### CSRF

Todas las solicitudes mutantes (`POST`/`PUT`/`PATCH`/`DELETE`) hacia `/api/*`
pasan por una verificación de **cookie de doble envío**
(`lib/security/csrf.ts` + `middleware.ts`, §29):

1. El servidor emite una cookie no-`httpOnly` `crisis_csrf`.
2. El cliente debe reenviar ese mismo valor en el header `x-csrf-token`.
3. `middleware.ts` rechaza con `403 CSRF_VALIDATION_FAILED` cualquier
   solicitud mutante donde la cookie y el header no coincidan (o falten).

Quedan exentas las rutas donde aún no existe sesión o que usan otro mecanismo
de autenticación: `auth/register`, `auth/login`, `auth/logout`,
`auth/verify-email`, `auth/resend-verification`, `auth/forgot-password`,
`auth/reset-password` y todo `cron/*` (autenticado por bearer secret, no por
cookies).

Esta verificación es una defensa independiente además del `SameSite=lax` de
la cookie de sesión — no sustituye la autorización real, que cada route
handler sigue verificando server-side con `requireCurrentUser` /
`requireUserWithPermission`.

### Guardas de autenticación y autorización

- **`requireCurrentUser()`** (`lib/auth/current-user.ts`) — exige una sesión
  válida; lanza `UnauthorizedError` (401) si no la hay. Es el mínimo que usan
  todos los endpoints de usuario final.
- **`requireUserWithPermission(permission)`** (`lib/permissions/require.ts`)
  — llama primero a `requireCurrentUser()` y luego verifica un permiso RBAC
  puntual (`lib/permissions/rbac.ts` → `requirePermission`), lanzando
  `ForbiddenError` (403) si el usuario no lo tiene. Es lo que usan
  prácticamente todos los endpoints bajo `/admin/*`.
- Los permisos son claves como `tools.read`, `tools.publish`, `users.suspend`,
  etc., definidos en `lib/permissions/definitions.ts` y asignados por rol.
- `middleware.ts` además hace un redirect "grueso" a `/login` para páginas
  protegidas basándose solo en la presencia de la cookie de sesión (no
  decodifica ni valida nada) — es una mejora de UX, nunca el límite real de
  autorización.
- Los endpoints `cron/*` no usan sesión de usuario en absoluto: exigen
  `Authorization: Bearer $CRON_SECRET` vía `assertValidCronRequest()`
  (`lib/security/cron-auth.ts`).

### Rate limiting

`lib/security/rate-limit.ts` expone un limitador de ventana fija
(Upstash Redis en producción; en memoria, no distribuido, en desarrollo si
`REDIS_URL`/`REDIS_TOKEN` no están configurados). Se aplica endpoint por
endpoint donde el riesgo de abuso lo justifica — login, registro,
forgot/reset-password, resend-verification, y las rutas de voz
(`speech/transcribe`, `speech/synthesize`) son los casos aplicados hoy—
devolviendo `429 RATE_LIMITED` cuando se excede. No todos los endpoints están
limitados; esta guía no repite el límite exacto de cada uno.

---

## 2. Autenticación (`auth/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Pública (rate limited) | Crea una cuenta, hashea la contraseña, evalúa su fortaleza y asigna el rol por defecto. |
| POST | `/api/v1/auth/login` | Pública (rate limited, bloqueo tras 5 intentos fallidos / 15 min) | Verifica credenciales; si el usuario tiene MFA activo devuelve un estado pendiente en vez de crear sesión. |
| POST | `/api/v1/auth/mfa/login-verify` | Sesión de login pendiente de MFA (rate limited) | Verifica el código TOTP y completa el login iniciado en `/auth/login`. |
| POST | `/api/v1/auth/logout` | Ninguna (usa la sesión si existe) | Destruye la sesión actual y registra el evento de auditoría. |
| GET | `/api/v1/auth/session` | Ninguna | Devuelve el usuario de la sesión actual o `{ user: null }`. |
| POST | `/api/v1/auth/verify-email` | Pública | Confirma el correo a partir de un token opaco de un solo uso. |
| POST | `/api/v1/auth/resend-verification` | Pública (rate limited) | Reenvía el correo de verificación (respuesta genérica, no revela si la cuenta existe). |
| POST | `/api/v1/auth/forgot-password` | Pública (rate limited) | Genera un token de restablecimiento y envía el correo (respuesta genérica). |
| POST | `/api/v1/auth/reset-password` | Pública | Establece una nueva contraseña con el token, y revoca todas las sesiones activas del usuario. |
| POST | `/api/v1/auth/mfa/setup` | `requireCurrentUser` | Genera un secreto TOTP nuevo (elimina cualquier intento de configuración previo sin confirmar). |
| POST | `/api/v1/auth/mfa/verify` | `requireCurrentUser` | Confirma el código TOTP, activa MFA y genera los códigos de recuperación. |
| POST | `/api/v1/auth/mfa/disable` | `requireCurrentUser` | Desactiva MFA para el usuario actual. |

---

## 3. Perfil de usuario (`me/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/me` | `requireCurrentUser` | Devuelve el perfil del usuario actual. |
| PATCH | `/api/v1/me` | `requireCurrentUser` | Actualiza nombre, locale, timezone y otros campos de perfil. |
| DELETE | `/api/v1/me` | `requireCurrentUser` | Registra una solicitud de baja/cierre de cuenta y cierra la sesión. |
| GET | `/api/v1/me/preferences` | `requireCurrentUser` | Devuelve preferencias de accesibilidad (tema, movimiento reducido, alto contraste, escala de texto). |
| PATCH | `/api/v1/me/preferences` | `requireCurrentUser` | Actualiza esas preferencias. |
| GET | `/api/v1/me/consents` | `requireCurrentUser` | Lista los consentimientos otorgados (memoria, analítica, marketing) y el documento legal vigente. |
| PATCH | `/api/v1/me/consents` | `requireCurrentUser` | Otorga o revoca un consentimiento puntual. |
| POST | `/api/v1/me/export` | `requireCurrentUser` | Encola una solicitud de exportación de datos personales (job asíncrono). |
| GET | `/api/v1/me/export/{requestId}` | `requireCurrentUser` (debe ser dueño de la solicitud) | Descarga el export una vez que el job terminó. |

---

## 4. Catálogo y activación de herramientas (`catalog/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/catalog` | `requireCurrentUser` | Lista las herramientas del catálogo visibles/asignables para el usuario. |
| GET | `/api/v1/catalog/{id}` | `requireCurrentUser` | Detalle de una herramienta (acepta UUID o slug en el mismo segmento). |
| POST | `/api/v1/catalog/{id}/activate` | `requireCurrentUser` | Activa la herramienta para el usuario actual. |
| POST | `/api/v1/catalog/{id}/deactivate` | `requireCurrentUser` | Desactiva la herramienta para el usuario actual. |
| POST | `/api/v1/catalog/{id}/request-access` | `requireCurrentUser` | Solicita acceso a una herramienta restringida (con motivo opcional). |
| GET | `/api/v1/catalog/{id}/manifest` | `requireCurrentUser` + acceso a la herramienta | Web App Manifest dinámico (§18) generado desde la versión publicada; 404 si la herramienta no tiene PWA habilitada. |
| DELETE | `/api/v1/catalog/{id}/memory` | `requireCurrentUser` | Borra toda la memoria del usuario con esa herramienta, en todas sus conversaciones. |

---

## 5. Conversaciones y mensajes (`conversations/*`, `messages/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/conversations` | `requireCurrentUser` | Lista las conversaciones del usuario. |
| POST | `/api/v1/conversations` | `requireCurrentUser` + acceso a la herramienta | Crea una conversación nueva para un `toolId`. |
| GET | `/api/v1/conversations/{id}` | `requireCurrentUser` (dueño) | Detalle de la conversación con su historial de mensajes. |
| PATCH | `/api/v1/conversations/{id}` | `requireCurrentUser` (dueño) | Renombra la conversación. |
| DELETE | `/api/v1/conversations/{id}` | `requireCurrentUser` (dueño) | Elimina la conversación. |
| POST | `/api/v1/conversations/{id}/archive` | `requireCurrentUser` (dueño) | Archiva la conversación. |
| POST | `/api/v1/conversations/{id}/restore` | `requireCurrentUser` (dueño) | Restaura una conversación archivada. |
| POST | `/api/v1/conversations/{id}/export` | `requireCurrentUser` (dueño) | Exporta el contenido completo de la conversación. |
| DELETE | `/api/v1/conversations/{id}/memory` | `requireCurrentUser` (dueño) | Borra la memoria asociada solo a esta conversación. |
| POST | `/api/v1/conversations/{id}/cancel` | `requireCurrentUser` (dueño) | Limpieza defensiva para una generación en curso cuya función serverless se cortó sin que el `AbortController` del cliente llegara a propagarse. |
| POST | `/api/v1/conversations/{id}/escalate` | `requireCurrentUser` (dueño) | Escala la conversación a revisión humana. |
| POST | `/api/v1/conversations/{id}/messages` | `requireCurrentUser` (dueño) | **Streaming NDJSON.** Envía un mensaje y transmite la respuesta del pipeline conversacional evento por evento (`newline-delimited JSON`); observa `request.signal` para cancelar la generación en el proveedor LLM si el cliente aborta el fetch. |
| POST | `/api/v1/conversations/{id}/tool-confirmations/{confirmationId}/approve` | `requireCurrentUser` (dueño) | **Streaming NDJSON.** Aprueba una llamada a herramienta pausada (§15 human-in-the-loop) y reanuda la generación; admite un body opcional `{ formAnswers }` cuando la confirmación pendiente es de tipo `collect_form_input`. |
| POST | `/api/v1/conversations/{id}/tool-confirmations/{confirmationId}/reject` | `requireCurrentUser` (dueño) | **Streaming NDJSON.** Rechaza la llamada a herramienta pausada; el modelo recibe la negativa explícita y continúa el ciclo de rondas en vez de morir sin explicación. |
| POST | `/api/v1/messages/{id}/regenerate` | `requireCurrentUser` (dueño) | **Streaming NDJSON.** Regenera la respuesta de un mensaje del asistente. |
| POST | `/api/v1/messages/{id}/feedback` | `requireCurrentUser` (dueño de la conversación) | Registra un rating (`up`/`down`) y comentario opcional sobre un mensaje. |

---

## 6. Archivos (`files/*`, `generated-files/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| POST | `/api/v1/files` | `requireCurrentUser` | Inicia una subida: registra metadata (nombre, mime type, tamaño) y devuelve el `id` para el siguiente paso. |
| GET | `/api/v1/files/{id}` | `requireCurrentUser` (dueño) | Metadata del archivo subido. |
| DELETE | `/api/v1/files/{id}` | `requireCurrentUser` (dueño) | Elimina el archivo (soft delete). |
| POST | `/api/v1/files/{id}/upload-complete` | `requireCurrentUser` (dueño) | Recibe los bytes crudos del archivo en el cuerpo de la solicitud y completa la subida (§17: handshake de dos pasos, no subida directa navegador→Blob). |
| GET | `/api/v1/files/{id}/download` | `requireCurrentUser` (dueño) | Proxy autenticado de descarga: revalida la propiedad y transmite el archivo, en vez de exponer una URL firmada. |
| GET | `/api/v1/generated-files/{id}` | `requireCurrentUser` (dueño) | Metadata de un documento generado por una herramienta (título, tipo, mime type). |
| GET | `/api/v1/generated-files/{id}/download` | `requireCurrentUser` (dueño) | Proxy autenticado de descarga para documentos generados, mismo patrón que `files/{id}/download`. |

---

## 7. Voz (`voices`, `speech/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/voices` | `requireCurrentUser` | Lista las voces disponibles del proveedor TTS; devuelve lista vacía (no un error) si la voz no está habilitada/configurada (§16). |
| POST | `/api/v1/speech/transcribe` | `requireCurrentUser` (rate limited) | Transcribe audio a texto (STT); valida el MIME real por magic bytes y el tamaño máximo antes de enviarlo al proveedor. |
| POST | `/api/v1/speech/synthesize` | `requireCurrentUser` (rate limited) | Sintetiza texto a audio (TTS) con una voz determinada. |

---

## 8. Notificaciones (`notifications/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/notifications` | `requireCurrentUser` | Lista notificaciones del usuario, paginada (`limit`, tope 100). |
| POST | `/api/v1/notifications/{id}/read` | `requireCurrentUser` (dueño) | Marca una notificación como leída. |
| POST | `/api/v1/notifications/read-all` | `requireCurrentUser` | Marca todas las notificaciones no leídas del usuario como leídas. |

---

## 9. Admin — Usuarios y grupos (`admin/users/*`, `admin/groups/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/users` | `users.read` | Lista/busca usuarios (filtro por nombre/correo). |
| POST | `/api/v1/admin/users` | `users.create` | Crea un usuario desde el panel admin, con rol inicial. |
| POST | `/api/v1/admin/users/import` | `users.create` | Crea usuarios en lote (importación masiva). |
| GET | `/api/v1/admin/users/{id}` | `users.read` | Detalle de usuario: perfil, roles, grupos, herramientas asignadas. |
| DELETE | `/api/v1/admin/users/{id}` | `users.delete` | Elimina un usuario. |
| POST | `/api/v1/admin/users/{id}/suspend` | `users.suspend` | Suspende la cuenta. |
| POST | `/api/v1/admin/users/{id}/reactivate` | `users.suspend` | Reactiva una cuenta suspendida. |
| POST | `/api/v1/admin/users/{id}/block` | `users.suspend` | Bloquea la cuenta (más severo que suspender). |
| POST | `/api/v1/admin/users/{id}/roles` | `roles.manage` | Asigna un rol RBAC al usuario. |
| DELETE | `/api/v1/admin/users/{id}/roles/{roleId}` | `roles.manage` | Quita un rol del usuario. |
| POST | `/api/v1/admin/users/{id}/groups` | `groups.manage` | Agrega el usuario a un grupo. |
| DELETE | `/api/v1/admin/users/{id}/groups/{groupId}` | `groups.manage` | Quita al usuario de un grupo. |
| POST | `/api/v1/admin/users/{id}/sessions/revoke` | `users.suspend` | Revoca todas las sesiones activas del usuario (cierre forzado). |
| POST | `/api/v1/admin/users/{id}/tools` | `tools.assign` | Asigna (`ALLOW`/`DENY`) una herramienta directamente a un usuario. |
| DELETE | `/api/v1/admin/users/{id}/tools/{toolId}` | `tools.assign` | Revoca la asignación directa de herramienta al usuario. |
| GET | `/api/v1/admin/groups` | `groups.read` | Lista los grupos. |
| POST | `/api/v1/admin/groups` | `groups.manage` | Crea un grupo. |
| GET | `/api/v1/admin/groups/{id}` | `groups.read` | Detalle del grupo (miembros, herramientas asignadas). |
| PATCH | `/api/v1/admin/groups/{id}` | `groups.manage` | Actualiza nombre/descripción del grupo. |
| DELETE | `/api/v1/admin/groups/{id}` | `groups.manage` | Elimina el grupo. |
| POST | `/api/v1/admin/groups/{id}/users` | `groups.manage` | Agrega un usuario al grupo. |
| DELETE | `/api/v1/admin/groups/{id}/users/{userId}` | `groups.manage` | Quita un usuario del grupo. |
| POST | `/api/v1/admin/groups/{id}/tools` | `tools.assign` | Asigna (`ALLOW`/`DENY`) una herramienta a todo el grupo. |
| DELETE | `/api/v1/admin/groups/{id}/tools/{toolId}` | `tools.assign` | Revoca la asignación de herramienta al grupo. |

---

## 10. Admin — Herramientas (`admin/tools/*`, incl. versiones y evaluaciones)

Incluye el ciclo de vida completo de versionado de herramientas (§9):
borrador → prueba → revisión → aprobación → publicación (inmediata o
programada), además de pausa/reanudación/suspensión/archivado de la
herramienta, rollback a una versión anterior, duplicado, comparación de
versiones y las evaluaciones automatizadas que corren contra una versión.

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/tools` | `tools.read` | Lista las herramientas (últimas 100). |
| POST | `/api/v1/admin/tools` | `tools.create` | Crea una herramienta nueva (con su primera versión en borrador). |
| GET | `/api/v1/admin/tools/{id}` | `tools.read` | Detalle de la herramienta y su versión publicada. |
| PATCH | `/api/v1/admin/tools/{id}` | `tools.update` | Actualiza metadata de la herramienta (responsable, equipo, categoría). |
| POST | `/api/v1/admin/tools/{id}/pause` | `tools.pause` | Pausa la herramienta (con motivo opcional). |
| POST | `/api/v1/admin/tools/{id}/resume` | `tools.pause` | Reanuda una herramienta pausada. |
| POST | `/api/v1/admin/tools/{id}/suspend` | `tools.suspend` | Suspende la herramienta (motivo obligatorio). |
| POST | `/api/v1/admin/tools/{id}/archive` | `tools.archive` | Archiva la herramienta. |
| POST | `/api/v1/admin/tools/{id}/rollback` | `tools.publish` | Vuelve a publicar una versión anterior (`targetVersionId`) como la versión activa. |
| POST | `/api/v1/admin/tools/{id}/duplicate` | `tools.create` | Duplica la herramienta completa bajo un nuevo `slug`. |
| GET | `/api/v1/admin/tools/{id}/versions` | `tools.read` | Lista las versiones de la herramienta. |
| POST | `/api/v1/admin/tools/{id}/versions` | `tools.update` | Crea/asegura una nueva versión en borrador editable. |
| GET | `/api/v1/admin/tools/{id}/versions/compare?a={versionId}&b={versionId}` | `tools.read` | Diff entre dos versiones. |
| GET | `/api/v1/admin/tools/{id}/versions/{versionId}` | `tools.read` | Detalle y configuración completa de una versión. |
| PATCH | `/api/v1/admin/tools/{id}/versions/{versionId}` | `tools.update` | Aplica una o varias secciones de configuración (branding, comportamiento, modelos, capacidades, reglas de acceso, políticas de seguridad, PWA) a una versión en borrador. |
| POST | `/api/v1/admin/tools/{id}/versions/{versionId}/test` | `tools.update` | Ejecuta un mensaje de prueba contra la versión en borrador y la marca como `TESTING`. |
| POST | `/api/v1/admin/tools/{id}/versions/{versionId}/review` | `tools.review` | Envía la versión a revisión. |
| POST | `/api/v1/admin/tools/{id}/versions/{versionId}/approve` | `tools.approve` | Aprueba la versión revisada. |
| POST | `/api/v1/admin/tools/{id}/versions/{versionId}/publish` | `tools.publish` | Publica la versión aprobada de inmediato. |
| POST | `/api/v1/admin/tools/{id}/versions/{versionId}/schedule` | `tools.publish` | Programa la publicación de la versión para una fecha/hora futura (`scheduledFor`); la ejecuta el cron diario. |
| GET | `/api/v1/admin/evaluations` | `tools.read` | Lista los conjuntos de evaluación (suites) configurados. |
| POST | `/api/v1/admin/evaluations` | `tools.update` | Crea una suite de evaluación para una herramienta. |
| GET | `/api/v1/admin/evaluations/{id}` | `tools.read` | Detalle de la suite y sus casos de prueba. |
| POST | `/api/v1/admin/evaluations/{id}/cases` | `tools.update` | Agrega un caso (input, comportamiento esperado, nivel de riesgo) a la suite. |
| POST | `/api/v1/admin/evaluations/{id}/run` | `tools.update` | Ejecuta la suite completa contra una versión (`toolVersionId`), de forma síncrona. |
| GET | `/api/v1/admin/evaluation-runs/{id}` | `tools.read` | Resultado detallado de una ejecución de evaluación. |
| POST | `/api/v1/admin/evaluation-runs/{id}/cancel` | `tools.update` | Endpoint de cancelación; existe por completitud de la API — hoy `runSuite()` corre de forma síncrona, sin ventana real para interceptarlo a mitad de ejecución. |

---

## 11. Admin — Conocimiento (`admin/knowledge-bases/*`, `admin/knowledge-documents/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/knowledge-bases` | `knowledge.read` | Lista las bases de conocimiento (RAG). |
| POST | `/api/v1/admin/knowledge-bases` | `knowledge.manage` | Crea una base de conocimiento, opcionalmente ligada a una herramienta. |
| GET | `/api/v1/admin/knowledge-bases/{id}` | `knowledge.read` | Detalle de la base y sus documentos. |
| PATCH | `/api/v1/admin/knowledge-bases/{id}` | `knowledge.manage` | Deshabilita la base de conocimiento. |
| DELETE | `/api/v1/admin/knowledge-bases/{id}` | `knowledge.manage` | Elimina la base de conocimiento. |
| POST | `/api/v1/admin/knowledge-bases/{id}/documents` | `knowledge.manage` | Inicia la subida de un documento a la base (handshake de metadata, igual que `files`). |
| DELETE | `/api/v1/admin/knowledge-documents/{id}` | `knowledge.manage` | Elimina un documento de la base de conocimiento. |
| POST | `/api/v1/admin/knowledge-documents/{id}/upload-complete` | `knowledge.manage` | Recibe los bytes del documento y dispara su indexación (embeddings). |
| POST | `/api/v1/admin/knowledge-documents/{id}/reindex` | `knowledge.manage` | Vuelve a generar los embeddings/chunks del documento. |
| POST | `/api/v1/admin/knowledge-documents/{id}/disable` | `knowledge.manage` | Deshabilita el documento sin eliminarlo (deja de usarse en RAG). |

---

## 12. Admin — Proveedores (`admin/providers/*`, `admin/models`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/providers` | `providers.read` | Lista los proveedores de IA configurados (LLM, embeddings, moderación, STT, TTS). |
| PATCH | `/api/v1/admin/providers/{id}` | `providers.manage` | Actualiza la configuración de un proveedor. |
| POST | `/api/v1/admin/providers/{id}/test` | `providers.manage` | Ejecuta un healthcheck puntual contra el proveedor (LLM/embeddings/moderación). |
| POST | `/api/v1/admin/providers/{id}/sync-models` | `providers.manage` | Sincroniza el catálogo de modelos disponibles del proveedor. |
| GET | `/api/v1/admin/models` | `providers.read` | Lista los modelos sincronizados, con su proveedor. |

### Credenciales BYO por herramienta

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/tools/{id}/credentials` | `tools.credentials.manage` | Lista proveedores configurados sin devolver claves. |
| PUT / DELETE | `/api/v1/admin/tools/{id}/credentials/{providerId}` | `tools.credentials.manage` | Guarda cifrada o elimina una clave de IA auxiliar o LLM. |
| POST | `/api/v1/admin/tools/{id}/credentials/{providerId}/test` | `tools.credentials.manage` | Prueba la credencial guardada. |
| GET / POST | `/api/v1/admin/tools/{id}/external-credentials` | `tools.credentials.manage` | Lista o crea credenciales para endpoints externos. |
| PUT / DELETE | `/api/v1/admin/tools/{id}/external-credentials/{credentialId}` | `tools.credentials.manage` | Actualiza o elimina una credencial externa no vinculada. |

---

## 13. Admin — Analítica (`admin/analytics/*`)

Todos los endpoints de esta sección requieren `analytics.read` (§27).

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/analytics/overview` | `analytics.read` | Métricas agregadas de la plataforma (conversaciones, mensajes, herramientas, usuarios, uso, costos). |
| GET | `/api/v1/admin/analytics/users` | `analytics.read` | Crecimiento de usuarios (últimos 30 días) y desglose por estado. |
| GET | `/api/v1/admin/analytics/tools` | `analytics.read` | Uso por herramienta: activaciones, conversaciones, mensajes. |
| GET | `/api/v1/admin/analytics/models` | `analytics.read` | Uso desglosado por proveedor/modelo. |
| GET | `/api/v1/admin/analytics/costs` | `analytics.read` | Totales diarios (últimos 30 días) y desglose de costo por herramienta. |
| GET | `/api/v1/admin/analytics/errors` | `analytics.read` | Feed de eventos de seguridad recientes, acciones de auditoría fallidas y jobs fallidos/muertos — el sustituto de un tracker de errores externo dedicado. |

---

## 14. Admin — Auditoría y conversaciones (`admin/audit/*`, `admin/conversations/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/audit` | `audit.read` | Lista el registro de auditoría (`auditEvents`). |
| GET | `/api/v1/admin/audit/{id}` | `audit.read` | Detalle de un evento de auditoría puntual. |
| GET | `/api/v1/admin/conversations` | `conversations.metadata.read` | Lista conversaciones de todos los usuarios (solo metadata: sin contenido de mensajes), filtrable por `userId`. |
| GET | `/api/v1/admin/conversations/{id}` | `conversations.metadata.read` | Resumen de una conversación (metadata) sin exponer el contenido de los mensajes. |
| POST | `/api/v1/admin/conversations/{id}/content` | `conversations.content.read` | **Acceso excepcional a contenido (§30).** Requiere un motivo (`reason`, 10–500 caracteres) en el body — deliberadamente `POST`, no `GET`, para que el motivo nunca quede en una URL logueada por un proxy o el historial del navegador. Cada lectura queda auditada. |

---

## 15. Admin — Seguridad

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/health/dependencies` | `requireCurrentUser` + `security.read` | Expone salud de infraestructura y respaldos globales, más conteos de credenciales BYO por tipo; nunca devuelve secretos. Exclusivo para administradores (§35). |

La revocación de sesiones de un usuario (`POST /api/v1/admin/users/{id}/sessions/revoke`,
`users.suspend`) y la gestión de MFA propio (`auth/mfa/*`, sección 2) son
también controles de seguridad, pero se documentan en sus secciones
naturales (Usuarios y Autenticación) para no duplicar filas.

---

## 16. Admin — Trabajos en segundo plano y configuración (`admin/jobs/*`, `admin/settings/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/admin/jobs` | `settings.manage` | Lista los jobs en segundo plano (`backgroundJobs`). |
| GET | `/api/v1/admin/jobs/{id}` | `settings.manage` | Estado detallado de un job. |
| POST | `/api/v1/admin/jobs/{id}/retry` | `settings.manage` | Reintenta un job fallido. |
| POST | `/api/v1/admin/jobs/{id}/cancel` | `settings.manage` | Solicita la cancelación cooperativa de un job en curso. |
| GET | `/api/v1/admin/settings/feature-flags` | `settings.manage` | Lista los feature flags de la plataforma. |
| PATCH | `/api/v1/admin/settings/feature-flags` | `settings.manage` | Activa/desactiva un feature flag por `key`. |

---

## 17. Cron (`cron/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| POST | `/api/v1/cron/daily` | `Authorization: Bearer $CRON_SECRET` (`assertValidCronRequest`, sin sesión de usuario) | Punto de entrada único y consolidado (límite del plan Hobby de Vercel: cron una vez al día). En una sola invocación: procesa jobs pendientes, publica versiones programadas vencidas, y ejecuta los handlers de limpieza de archivos expirados, expiración de confirmaciones de herramienta pendientes, retención/purga de datos, y healthcheck de proveedores. Registra un evento de auditoría `cron.daily.run` con el resumen de resultados. |

---

## 18. Salud (`health/*`)

| Método | Ruta | Permiso/guardia requerida | Descripción |
|---|---|---|---|
| GET | `/api/v1/health/live` | Pública | *Liveness*: solo confirma que el proceso responde. Sin chequeo de dependencias, sin secretos. |
| GET | `/api/v1/health/ready` | Pública | *Readiness*: chequeo barato y acotado de dependencias críticas (conectividad a la base de datos). No expone qué proveedores están configurados — eso es `/health/dependencies` (sección 15, solo admin). |

(`GET /api/v1/health/dependencies` se documenta en la sección 15, Admin —
Seguridad, porque exige `security.read` y no es un endpoint público.)
