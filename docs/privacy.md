# Privacidad y protección de datos

Esta guía documenta cómo la plataforma trata los datos personales de los
usuarios: qué se almacena, qué consentimientos existen, cómo un usuario
exporta o intenta eliminar sus datos, cómo funciona la retención, y qué
controles de minimización de datos aplican al acceso administrativo
excepcional a contenido de conversaciones (§30). No es un aviso legal — es
la descripción técnica de lo que el código realmente hace; el aviso de
privacidad dirigido a usuarios finales es el documento `legal_documents` de
tipo `privacy_policy` descrito en la sección 8.

## 1. Resumen: qué datos personales existen y dónde

| Dato | Tabla / archivo | Notas |
|---|---|---|
| Identidad y credenciales | `users`, `db/schema/auth.ts` | email, hash de contraseña, estado (`ACTIVE`/`DELETED`) |
| Perfil | `userProfiles` | nombre a mostrar, locale, timezone |
| Conversaciones | `conversations`, `db/schema/conversations.ts` | vinculadas a `userId` y `toolId`, con `status` (incluye `DELETED`) |
| Mensajes | `messages` | contenido real de la conversación (`content`) |
| Memoria conversacional | `conversationMemories` | extractos de turnos de usuario, ver sección 3 |
| Archivos subidos/generados | `uploadedFiles`, `generatedFiles` | metadatos + blob en `lib/storage` |
| Consentimientos | `consents` | ver sección 2 |
| Aceptación de documentos legales | `legalAcceptances` | tabla existe en el esquema pero **no tiene ningún punto de escritura ni lectura en el código actual** — ver nota de honestidad en la sección 2 |
| Documentos legales | `legalDocuments` | aviso de privacidad, términos, aviso de alcance por herramienta |
| Solicitudes de exportación/eliminación | `dataRequests` | ver secciones 4 y 6 |
| Auditoría | `db/schema/audit.ts` | quién hizo qué, incluyendo accesos excepcionales a contenido (§30) |

Todas estas tablas están en `db/schema/notifications.ts` (consents,
legalDocuments, legalAcceptances, dataRequests — a pesar del nombre del
archivo, que agrupa notificaciones y el módulo legal) salvo las ya
mencionadas explícitamente. El detalle columna por columna también está en
`docs/data-model.md` (sección de tablas `legal_documents`, `consents`,
`legal_acceptances`, `data_requests`).

## 2. Consentimientos

Tabla `consents` (`db/schema/notifications.ts`):

```
id, userId (cascade), legalDocumentId (cascade), kind varchar(40),
granted boolean default true, version int, createdAt, revokedAt
```

Tipos de consentimiento (`kind`) reconocidos por la API
(`app/api/v1/me/consents/route.ts`, `z.enum(["memory", "analytics", "marketing"])`):

| `kind` | Qué habilita | Dónde se consulta |
|---|---|---|
| `memory` | Memoria persistente entre conversaciones (modos `USER_APPROVED`/`STRUCTURED`/`LONG_TERM`) | `lib/conversations/memory.ts`, función `hasMemoryConsent` |
| `analytics` | Analítica de uso agregada | Registrado en `consents`, pero **no hay ningún código que lo verifique actualmente** — ver nota abajo |
| `marketing` | Comunicaciones sobre nuevas herramientas | Solo se registra el consentimiento; no existe un envío de marketing que lo consuma todavía |

**Cómo se registra/revoca:** `PATCH /api/v1/me/consents`
(`app/api/v1/me/consents/route.ts`) recibe `{ kind, granted }`, busca el
`legal_documents` de tipo `privacy_policy` publicado más reciente (falla con
`ValidationError` si no hay ninguno publicado) e **inserta una nueva fila**
en `consents` — no actualiza la anterior. Si `granted` es `false`, la fila
nueva se inserta con `revokedAt` igual a la fecha actual. Es decir, el
historial de consentimientos es append-only: cada cambio queda como un
evento propio, y `hasMemoryConsent` siempre busca la fila **vigente**
(`granted = true` y `revokedAt IS NULL`) más reciente. Cada cambio también
genera un evento de auditoría (`recordAuditEvent`, acción
`consent.update`). `GET /api/v1/me/consents` devuelve el historial completo
del usuario ordenado por fecha.

**Lectura honesta de brechas:**

- El componente `components/privacy/ConsentToggles.tsx` inicializa su
  estado local en memoria como `{ memory: false, analytics: false,
  marketing: false }` y **nunca llama a `GET /api/v1/me/consents` para
  cargar el estado real** antes de mostrar los checkboxes. Esto significa
  que la UI siempre parte de "todo desactivado" en cada carga de página,
  independientemente de lo que el usuario haya consentido antes — el
  backend sí conserva el estado correctamente, pero la UI no lo refleja al
  montar el componente.
- El consentimiento `analytics` no gatea ningún código real: no existe un
  módulo de analítica de comportamiento/tracking (`lib/analytics/` existe
  como directorio pero está vacío) y el flag `ENABLE_ANALYTICS` de
  `lib/env.ts` no es leído por ningún otro archivo del repositorio. Los
  paneles de analítica que sí existen (`app/api/v1/admin/analytics/*`,
  gateados por el permiso `analytics.read` — ver `docs/authorization.md`)
  operan sobre datos operativos ya recolectados para facturación/uso
  (mensajes, costos, errores), no sobre un pipeline de tracking separado
  que el consentimiento `analytics` controle.
- La tabla `legal_acceptances` (pensada para registrar la aceptación de
  términos, p. ej. en el primer login) está definida en el esquema
  (`db/schema/notifications.ts`) pero no tiene ninguna inserción ni lectura
  en el código actual — no hay un flujo de "aceptar términos" implementado
  todavía, más allá del aviso de privacidad mostrado en `/privacy`.

## 3. Memoria conversacional y consentimiento (§13, §30)

`lib/conversations/memory.ts` implementa la memoria como un almacén simple
de ventana de recencia (últimos turnos de usuario, truncados a 500
caracteres) sobre la tabla `conversationMemories` — deliberadamente no es un
pipeline de extracción de hechos vía LLM, para tener una base real y
funcional que una iteración futura pueda reemplazar sin tocar los puntos de
llamada (`retrieveMemory` / `recordMemoryTurn`, ambos parametrizados por
`mode`).

El modo de memoria (`MemoryMode`) es una propiedad de configuración de la
herramienta, definida en `behaviorSchema` (`lib/validation/tools.ts`,
campo `memoryMode`, `z.enum([...])`, default `"DISABLED"`) y replicada como
enum de Postgres (`memoryModeEnum` en `db/schema/enums.ts`). Los seis
valores y su relación con el consentimiento:

| `mode` | Alcance | ¿Requiere consentimiento `memory`? |
|---|---|---|
| `DISABLED` | Sin memoria | No aplica — `retrieveMemory`/`recordMemoryTurn` retornan de inmediato |
| `CONVERSATION_ONLY` | Solo la conversación actual (`conversationMemories.conversationId`) | No — vive y muere con la conversación |
| `SESSION_ONLY` | Igual que `CONVERSATION_ONLY` en la implementación actual (misma consulta por `conversationId`) | No |
| `USER_APPROVED` | Persiste entre conversaciones, por `userId` + `toolId` | **Sí** |
| `STRUCTURED` | Igual alcance que `USER_APPROVED` | **Sí** |
| `LONG_TERM` | Igual alcance que `USER_APPROVED` | **Sí** |

La verificación de consentimiento (`hasMemoryConsent`) es una función
privada del módulo que consulta `consents` filtrando por
`kind = "memory"`, `granted = true` y `revokedAt IS NULL`. Se llama en dos
puntos, ambos con el mismo criterio:

- `retrieveMemory`: si el modo es uno de los tres que persisten entre
  conversaciones y no hay consentimiento vigente, retorna `[]` (no lee nada,
  en vez de fallar la petición).
- `recordMemoryTurn`: con la misma condición, si no hay consentimiento
  vigente simplemente no inserta el turno — no se guarda nada nuevo.

**Revocación:** revocar el consentimiento (`PATCH /api/v1/me/consents` con
`{ kind: "memory", granted: false }`) no borra las filas de
`conversationMemories` ya existentes — solo hace que `hasMemoryConsent`
vuelva a devolver `false`, por lo que dejan de leerse y de escribirse
turnos nuevos en los modos que dependen de consentimiento. Para borrar el
contenido de memoria de una conversación específica existe una función
separada, `clearConversationMemory(conversationId, userId)`
(`lib/conversations/service.ts`), que sí hace un `DELETE` real sobre
`conversationMemories` filtrando por `conversationId` — pero no hay,
actualmente, un borrado masivo de toda la memoria persistente de un usuario
disparado automáticamente al revocar el consentimiento; solo deja de
usarse la que ya existe.

## 4. Exportación de datos del usuario (self-service)

Flujo completo, en tres piezas:

1. **`POST /api/v1/me/export`** (`app/api/v1/me/export/route.ts`): crea una
   fila en `dataRequests` con `kind: "export"`, encola un job
   `account.export_data` vía `getJobProvider().enqueue(...)` (con
   `idempotencyKey: export:${requestId}` para evitar duplicados si se
   reintenta) y registra un evento de auditoría
   (`account.export_request`). Devuelve `{ requestId, jobId }` de
   inmediato — la generación del archivo es asíncrona.
2. **El job `account.export_data`** (`lib/jobs/handlers/export.ts`) arma un
   único JSON con:
   - datos de la cuenta (`id`, `email`, `createdAt` — no la contraseña ni
     el hash);
   - el perfil (`userProfiles`);
   - todas las conversaciones del usuario y, para cada una, todos sus
     mensajes;
   - metadatos de archivos subidos (`id`, `originalName`, `mimeType`,
     `sizeBytes`, `createdAt` — no el contenido binario del archivo);
   - el historial completo de consentimientos (`consents`).

   El JSON se sube al storage adapter configurado (`lib/storage`,
   Vercel Blob en producción) bajo la clave
   `exports/${userId}/${requestId}.json`, y la fila `dataRequests` se
   actualiza a `status: "COMPLETED"` con `resultBlobKey` apuntando a ese
   blob. El comentario del propio archivo explica por qué el export no se
   arma inline en el handler HTTP: su tamaño es potencialmente ilimitado
   (todo el historial de mensajes de un usuario activo), así que tiene que
   pasar por el sistema de trabajos asíncronos en vez de bloquear una
   petición.
3. **`GET /api/v1/me/export/[requestId]`**
   (`app/api/v1/me/export/[requestId]/route.ts`): descarga el resultado.
   Verifica que la solicitud pertenezca al usuario autenticado
   (`ForbiddenError` si no), que el estado sea `COMPLETED` y que exista
   `resultBlobKey` (si no, `ValidationError` — "todavía se está
   procesando"), y sirve el blob con
   `Content-Disposition: attachment` y `Cache-Control: private, no-store`.

Desde la UI, el botón "Exportar mis datos" en `/privacy`
(`components/privacy/DataActions.tsx`) llama al `POST`, recibe el
`requestId` y redirige el navegador directamente al `GET` de descarga — sin
paso intermedio de "esperar a que termine": en la práctica, dado que el job
corre vía cron (ver `docs/deployment-vercel.md`, sección de crons), la
descarga inmediata puede devolver el error de "todavía se está procesando"
si el cron no ha corrido aún.

## 5. Retención y eliminación

Tres mecanismos de purga independientes, todos como jobs de
`lib/jobs/handlers/`:

**a. Borrado lógico de conversaciones** — `deleteConversation` en
`lib/conversations/service.ts` (línea 75) no borra nada: hace
`UPDATE conversations SET status = 'DELETED', deletedAt = now()` y registra
un evento de auditoría (`conversation.delete`). La conversación deja de
listarse/ser accesible para el usuario de inmediato, pero su contenido
(`messages`) sigue existiendo en la base de datos.

**b. Purga real de contenido tras la ventana de retención** — el job
`retention_cleanup` (`lib/jobs/handlers/retention.ts`) es el que
efectivamente borra los datos: busca conversaciones con
`status = 'DELETED'` y `deletedAt` anterior al corte
(`DEFAULT_DELETED_CONVERSATION_RETENTION_DAYS = 90` días, constante en el
mismo archivo), y para cada una hace `DELETE` real sobre `messages` y luego
sobre la propia fila de `conversations`. El mismo job también purga
notificaciones leídas con más de 30 días
(`DEFAULT_READ_NOTIFICATION_RETENTION_DAYS`). Es decir: entre el borrado
lógico y la purga real median hasta 90 días en los que el contenido sigue
existiendo (recuperable solo a nivel de base de datos, no vía la app).

**c. Expiración de archivos** — el job `cleanup_expired_files`
(`lib/jobs/handlers/files.ts`) recorre `uploadedFiles` y `generatedFiles`
con `expiresAt` vencido y `deletedAt IS NULL`, borra el blob subyacente vía
`getStorageAdapter().del(...)` (best-effort: si falla o el blob ya no
existe, igual marca la fila como borrada para que un barrido manual
posterior pueda reconciliar) y luego marca las filas como `DELETED`
(archivos subidos) o con `deletedAt` (archivos generados).

Los tres jobs corren como parte del cron consolidado
`/api/v1/cron/daily` descrito en `docs/deployment-vercel.md` (plan Hobby de
Vercel: una vez al día).

## 6. Eliminación de cuenta

**Lo que existe:** `DELETE /api/v1/me` (`app/api/v1/me/route.ts`) inserta
una fila en `dataRequests` con `kind: "deletion"`, registra un evento de
auditoría (`account.request_deletion`) y cierra la sesión del usuario
(`destroyCurrentSession`, que marca la sesión como `REVOKED` en la tabla
`sessions` y borra las cookies). El botón "Solicitar eliminación de cuenta"
en `/privacy` (`components/privacy/DataActions.tsx`) llama a este endpoint
tras una confirmación del navegador y redirige a `/login`.

**Lo que NO existe, honestamente:** a diferencia de la exportación, la
solicitud de eliminación **no encola ningún job**. No hay ningún handler
registrado (`registerJobHandler`) que consuma filas de `dataRequests` con
`kind: "deletion"` — a día de hoy la fila queda permanentemente en estado
`"PENDING"`. La cuenta del usuario no se marca como `DELETED`, su perfil no
se anonimiza y sus conversaciones/mensajes no se tocan; lo único que ocurre
de forma automática es el cierre de sesión. En la práctica, completar una
solicitud de eliminación de cuenta requiere una acción manual de un
administrador usando `deleteUser(userId, actorId)`
(`lib/admin/users-service.ts`, línea 92), que sí hace un borrado lógico
real: `UPDATE users SET status = 'DELETED', deletedAt = now()` más un
evento de auditoría (`user.delete`) — pero esa función no está conectada
automáticamente a las solicitudes de `dataRequests.kind = "deletion"`; es
una operación administrativa independiente (borrado de un usuario desde el
panel de administración) que no procesa la cola de solicitudes de
eliminación de los propios usuarios. Tampoco existe una purga en cascada de
conversaciones/mensajes/archivos específica para eliminación de cuenta más
allá del `onDelete: "cascade"` declarado en las foreign keys del esquema
(que solo actuaría si la fila `users` se borrara físicamente, cosa que
`deleteUser` tampoco hace — es un borrado lógico, no un `DELETE` de SQL).

En resumen: la solicitud de eliminación de cuenta queda registrada y
auditada, y cierra la sesión de inmediato, pero el procesamiento de fondo
que debería completar la eliminación real de los datos no está
implementado todavía.

## 7. Acceso excepcional de administradores a contenido (§30) — minimización de datos

Esta es la misma funcionalidad que `docs/authorization.md` documenta en su
sección "Acceso excepcional a contenido de conversaciones (§30)" desde el
ángulo de permisos/RBAC (qué rol tiene qué permiso, las dos rutas HTTP, la
UI condicionada por permiso). Aquí se describe el mismo mecanismo desde el
ángulo de protección de datos: por qué está diseñado para exponer lo mínimo
posible, no solo para restringir quién puede pedirlo.

`lib/admin/conversation-content.ts` separa deliberadamente dos capas de
acceso:

- **Metadatos** (`listConversationsForAdmin`,
  `getConversationSummaryForAdmin`): las consultas Drizzle seleccionan
  explícitamente columnas concretas (`id`, `userId`, `userEmail`,
  `toolSlug`, `status`, `messageCount`, `createdAt`, `lastMessageAt`) — la
  columna `messages.content` no está en el `select` de estas funciones ni
  siquiera cuando el llamador tiene permisos amplios. Esto es minimización
  de datos en la capa de consulta, no solo en la capa de autorización: un
  administrador de soporte (`SUPPORT_AGENT`, con `conversations.metadata.read`)
  no puede obtener contenido ni por error de programación en estas rutas,
  porque el contenido nunca sale de la base de datos por ese camino.

- **Contenido** (`readConversationContentForAdmin`): la única función que
  toca `messages.content`, con tres controles de minimización aplicados a
  la vez:
  1. **Motivo obligatorio real**: exige `reason.trim().length >= 10`
     (`MIN_REASON_LENGTH`); un motivo vacío o trivial lanza
     `ValidationError` antes de tocar la tabla de mensajes.
  2. **Registro de auditoría sin duplicar el dato sensible**: cada lectura
     genera un evento (`admin.conversation.content_read`) con el `reason`
     en su propio campo y `metadata: { conversationUserId, messageCount }`
     — deliberadamente **nunca** el contenido de los mensajes ni
     fragmentos de ellos, porque la tabla de auditoría es legible por el
     rol `AUDITOR`, y duplicar el contenido ahí anularía el propósito de
     tener un permiso separado para leerlo.
  3. **Forma de respuesta reducida**: `AdminMinimalMessage` solo trae
     `id`, `role`, `content`, `createdAt` — sin costo, tokens, modelo,
     resultado de moderación ni ids de adjuntos. Son campos que existen en
     `messages` y que un administrador revisando un caso de soporte o
     seguridad no necesita; cada uno que se omite es un campo menos que
     podría terminar en una pantalla de administración sin necesidad.

Del lado de la UI, `ConversationContentViewer`
(referenciado desde `app/admin/conversations/[id]/page.tsx`) tampoco
precarga contenido al montar la página: el administrador debe escribir el
motivo y pulsar explícitamente un botón que indica que la acción quedará
registrada. Cada clic dispara una petición `POST` nueva al servidor (no una
revelación del lado del cliente de datos ya obtenidos), por lo que el
servidor vuelve a verificar el permiso y vuelve a auditar en cada lectura,
sin posibilidad de "cachear" el acceso a contenido sensible en el
navegador.

Para el detalle de qué rol tiene cada permiso y por qué
`conversations.content.read` solo lo tiene `SUPER_ADMIN` (vía el arreglo
completo `ALL_PERMISSIONS`, ningún otro rol lo lista explícitamente), ver
`docs/authorization.md`.

## 8. Cookies y almacenamiento local

La plataforma no usa cookies de rastreo/analítica — las dos únicas cookies
son funcionales/de seguridad, documentadas en detalle en
`docs/authentication.md`:

- `crisis_session` (`AUTH_COOKIE_NAME`): `httpOnly`, inaccesible desde
  JavaScript — mitiga robo vía XSS.
- `crisis_csrf` (`CSRF_COOKIE_NAME`, `lib/security/csrf.ts`):
  deliberadamente **no** `httpOnly`, porque el mecanismo de doble envío
  (double-submit cookie) exige que el cliente la lea para reenviarla como
  cabecera `X-CSRF-Token`.

Ambas se borran al cerrar sesión. Ver también `docs/authentication.md`
(cierre de sesión) para el detalle de expiración/revocación.

**Almacenamiento local — borradores del composer de chat:**
`lib/chat/drafts.ts` persiste el texto en progreso del composer en
IndexedDB (base `crisis-chat-drafts`, store `drafts`, clave =
`conversationId`), para que una recarga o caída del navegador a mitad de un
mensaje no pierda lo que el usuario estaba escribiendo. No es un mecanismo
de tracking: solo guarda el texto del borrador actual por conversación
(`saveDraft`/`loadDraft`/`clearDraft`), no historial ni metadatos, y cada
operación es best-effort — si IndexedDB no está disponible (navegación
privada, política del navegador, entorno de test/SSR), el módulo falla en
silencio y simplemente no hay persistencia de borrador, nunca un error que
impida enviar el mensaje.

## 9. Documentos legales

`legal_documents` (tabla, `db/schema/notifications.ts`) almacena
documentos versionados de tipo `privacy_policy`, `terms` o
`tool_scope_notice` (este último asociado a una herramienta vía `toolId`,
sin FK declarada). `lib/legal/seed-legal.ts` (`seedDefaultLegalDocuments`)
siembra de forma idempotente una plantilla inicial de aviso de privacidad
(versión 1) si no existe ninguna publicada — nunca sobrescribe una ya
real. Esta siembra es necesaria porque `validateVersionForPublish` (§7,
ver `docs/tools.md`) exige que exista al menos un `privacy_policy`
publicado para que **cualquier** herramienta pueda publicarse, y también
corre en el `vercel-build` de producción (`docs/deployment-vercel.md`,
paso 4), donde omite datos de demostración pero siempre siembra el aviso de
privacidad por defecto.

El texto sembrado por defecto es explícitamente una plantilla ("Este texto
es una plantilla y debe ser reemplazado por el equipo legal de la
organización antes de operar con usuarios reales") — no debe tratarse como
un aviso de privacidad legalmente válido tal cual viene en el repositorio.

La página `/privacy` (`app/(user)/privacy/page.tsx`) es la única superficie
de cara al usuario que junta las tres piezas: muestra el contenido del
`privacy_policy` publicado más reciente, los controles de consentimiento
(`ConsentToggles`) y las acciones sobre datos propios (`DataActions`:
exportar, solicitar eliminación de cuenta) descritas en las secciones 2, 4
y 6.
