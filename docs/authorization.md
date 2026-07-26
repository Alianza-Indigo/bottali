# Autorización (RBAC)

Esta guía describe el mecanismo real de control de acceso de la plataforma:
el modelo de roles y permisos, cómo se verifica en el código de cada ruta,
el punto de paso único del panel `/admin`, las reglas de acceso a
herramientas por usuario final, y el mecanismo excepcional de lectura de
contenido de conversaciones (§30).

Todo el modelo vive en `lib/permissions/` y `db/schema/rbac.ts`. No hay
lógica de autorización paralela en otro lugar: cualquier ruta o página que
necesite restringir acceso pasa por estas funciones.

## Modelo RBAC (roles y permisos)

El catálogo de roles y permisos es **fijo y declarativo**, definido en
`lib/permissions/definitions.ts`. No se crean roles ni permisos nuevos desde
la UI: el archivo es la única fuente de verdad y se siembra en base de datos
(`lib/permissions/seed-rbac.ts`) en cada `db:migrate`/`db:seed`.

### Roles (`ROLE_KEYS`)

```
SUPER_ADMIN, PLATFORM_ADMIN, USER_ADMIN, TOOL_ADMIN, TOOL_EDITOR,
KNOWLEDGE_MANAGER, SECURITY_REVIEWER, ANALYTICS_VIEWER, SUPPORT_AGENT,
AUDITOR, USER
```

### Permisos (`PERMISSION_KEYS`)

```
users.read, users.create, users.update, users.suspend, users.delete,
roles.read, roles.manage,
groups.read, groups.manage,
tools.read, tools.create, tools.update, tools.review, tools.approve,
tools.publish, tools.pause, tools.suspend, tools.archive, tools.assign,
knowledge.read, knowledge.manage,
conversations.metadata.read, conversations.content.read,
providers.read, providers.manage,
analytics.read, costs.read,
audit.read, security.read,
settings.manage
```

### Matriz rol → permisos (`ROLE_PERMISSIONS`)

`SUPER_ADMIN` recibe `ALL_PERMISSIONS` (el arreglo completo de
`PERMISSION_KEYS` sin excepción) — es el único rol con
`conversations.content.read`. El resto de roles tiene un subconjunto fijo:

| Rol | Permisos |
|---|---|
| `SUPER_ADMIN` | *todos* (los 27 permisos, incluyendo `conversations.content.read`) |
| `PLATFORM_ADMIN` | `users.read`, `users.update`, `roles.read`, `groups.read`, `groups.manage`, `tools.read`, `tools.create`, `tools.update`, `tools.review`, `tools.approve`, `tools.publish`, `tools.pause`, `tools.suspend`, `tools.archive`, `tools.assign`, `knowledge.read`, `knowledge.manage`, `conversations.metadata.read`, `providers.read`, `providers.manage`, `analytics.read`, `costs.read`, `audit.read`, `security.read`, `settings.manage` |
| `USER_ADMIN` | `users.read`, `users.create`, `users.update`, `users.suspend`, `users.delete`, `roles.read`, `groups.read`, `groups.manage` |
| `TOOL_ADMIN` | `tools.read`, `tools.create`, `tools.update`, `tools.review`, `tools.approve`, `tools.publish`, `tools.pause`, `tools.suspend`, `tools.archive`, `tools.assign`, `knowledge.read`, `knowledge.manage`, `analytics.read` |
| `TOOL_EDITOR` | `tools.read`, `tools.create`, `tools.update`, `knowledge.read` |
| `KNOWLEDGE_MANAGER` | `knowledge.read`, `knowledge.manage`, `tools.read` |
| `SECURITY_REVIEWER` | `security.read`, `audit.read`, `tools.read`, `tools.review` |
| `ANALYTICS_VIEWER` | `analytics.read`, `costs.read`, `tools.read` |
| `SUPPORT_AGENT` | `users.read`, `conversations.metadata.read`, `tools.read` |
| `AUDITOR` | `audit.read`, `security.read`, `analytics.read`, `tools.read`, `users.read` |
| `USER` | *(ninguno — rol base, sin acceso administrativo)* |

Nótese la asimetría deliberada entre `conversations.metadata.read` (la tienen
`PLATFORM_ADMIN` y `SUPPORT_AGENT`, para operar soporte y el panel sin ver
contenido) y `conversations.content.read` (solo `SUPER_ADMIN`, vía el
`ALL_PERMISSIONS` de su fila — ningún otro rol la lista explícitamente). Ver
la sección §30 más abajo.

### Seed (`lib/permissions/seed-rbac.ts`)

`seedRolesAndPermissions(db)` es **idempotente**: para cada `key` de
`PERMISSION_KEYS`/`ROLE_KEYS` hace un `select` primero y solo inserta si no
existe; para cada rol, inserta únicamente las filas de `role_permissions`
que falten frente a `ROLE_PERMISSIONS`. Se ejecuta en cada
`npm run db:migrate`/`db:seed` (y por tanto en cada build de Vercel, ver
`docs/deployment-vercel.md`), en todo entorno incluido producción — es
imprescindible para que el registro de usuarios (que asigna el rol `USER`)
funcione en absoluto.

### Esquema de base de datos (`db/schema/rbac.ts`)

- `roles` — `id`, `key` (único, ej. `"SUPER_ADMIN"`), `name`, `description`,
  `is_system`, `created_at`.
- `permissions` — `id`, `key` (único, ej. `"tools.publish"`), `description`.
- `role_permissions` — tabla puente `role_id` × `permission_id`, clave
  primaria compuesta, `ON DELETE CASCADE` en ambos extremos.
- `user_roles` — tabla puente `user_id` × `role_id` (un usuario puede tener
  varios roles), con `assigned_by`/`assigned_at` para trazabilidad, clave
  primaria compuesta e índice sobre `role_id`.
- `groups` — `id`, `name`, `description`, `created_by`, `deleted_at` (borrado
  lógico).
- `group_members` — tabla puente `group_id` × `user_id`, clave primaria
  compuesta, índice sobre `user_id`.

Los permisos efectivos de un usuario son la **unión** de los permisos de
todos sus roles (ver siguiente sección) — no hay jerarquía de roles ni
herencia implícita, solo la unión plana vía `user_roles` →
`role_permissions` → `permissions`.

## Cómo se verifican los permisos en el código

Toda la lógica de lectura de permisos vive en `lib/permissions/rbac.ts` y es
puramente server-side; nunca se confía en un flag de permiso enviado por el
cliente.

- `getUserRoleKeys(userId)` — los `RoleKey` de un usuario (join
  `user_roles` → `roles`).
- `getUserPermissions(userId)` — un `Set<PermissionKey>` con la unión de
  permisos de todos los roles del usuario (join `user_roles` →
  `role_permissions` → `permissions`). Se recalcula desde la base de datos
  en cada llamada — no hay caché de permisos en sesión que pueda quedar
  desactualizada tras un cambio de rol.
- `hasPermission(userId, permission)` — booleano de conveniencia sobre
  `getUserPermissions`.
- `requirePermission(userId, permission)` — la primitiva de aplicación:
  si el usuario no tiene el permiso, **lanza `ForbiddenError`**
  (`lib/utils/errors.ts`, HTTP 403). Nunca retorna `false` silenciosamente
  ni acepta un permiso "declarado" por el llamador.
- `assertNotLastSuperAdmin(userId)` — invariante de plataforma (§19): no se
  puede eliminar ni degradar al último `SUPER_ADMIN` activo.

`lib/permissions/require.ts` expone el idioma estándar para rutas API:

```ts
export async function requireUserWithPermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireCurrentUser();
  await requirePermission(user.id, permission);
  return user;
}
```

Primero autentica (`requireCurrentUser`, lanza si no hay sesión), luego
comprueba el permiso concreto contra la base de datos, y devuelve el
`SessionUser` ya verificado para que la ruta lo use (por ejemplo, como
`actorId` de un evento de auditoría). Prácticamente todas las rutas bajo
`app/api/v1/admin/**` siguen el mismo patrón de una línea al principio del
handler, por ejemplo:

```ts
// app/api/v1/admin/users/[id]/suspend/route.ts
const admin = await requireUserWithPermission("users.suspend");
```

```ts
// app/api/v1/admin/jobs/route.ts
await requireUserWithPermission("settings.manage");
```

```ts
// app/api/v1/admin/users/[id]/roles/route.ts
const admin = await requireUserWithPermission("roles.manage");
```

```ts
// app/api/v1/admin/conversations/route.ts
await requireUserWithPermission("conversations.metadata.read");
```

El permiso exigido es siempre el más específico para la acción (p. ej.
`users.suspend` para suspender, no un genérico `users.manage`), y el chequeo
ocurre **antes** de tocar cualquier dato o ejecutar la operación — nunca
después de validar el cuerpo de la petición.

## El punto de paso único para `/admin`

`lib/permissions/admin-guard.ts` define `requireAdminAccess()`, el guard de
Server Component que atraviesan todas las páginas/layouts bajo `/admin`:

```ts
const ANY_ADMIN_PERMISSION: PermissionKey[] = [
  "users.read", "tools.read", "knowledge.read", "providers.read",
  "analytics.read", "audit.read", "security.read", "settings.manage",
];

export async function requireAdminAccess() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const permissions = await getUserPermissions(session.id);
  const hasAnyAdminPermission = ANY_ADMIN_PERMISSION.some((p) => permissions.has(p));
  if (!hasAnyAdminPermission) redirect("/dashboard");

  if (!(await isMfaEnabled(session.id))) redirect("/profile/mfa-setup?required=admin");

  return { session, permissions };
}
```

Es deliberadamente una comprobación **gruesa**: no valida un permiso
específico, solo que el usuario tenga *alguno* de los permisos listados en
`ANY_ADMIN_PERMISSION` — es decir, "¿puede este usuario ver el shell del
panel admin en absoluto?". Cada página o ruta API dentro de `/admin` sigue
verificando su propio permiso concreto vía `requireUserWithPermission`
(defensa en profundidad, ver más abajo); `requireAdminAccess()` no sustituye
ese chequeo, solo evita que un usuario sin ningún rol administrativo llegue
siquiera a ver la navegación del panel.

Sobre esa base se apila la exigencia de **MFA para administradores (§28)**:
si el usuario tiene permisos admin pero no tiene MFA habilitado
(`isMfaEnabled`), se le redirige a `/profile/mfa-setup?required=admin` antes
de devolver la sesión/permisos al llamador. Como `requireAdminAccess()` es
el único punto de entrada usado por todo el árbol `/admin` (páginas y
layouts), no existe una ruta de navegación que llegue a una pantalla admin
sin pasar por esta comprobación de MFA — es un único choke point, no una
lista de excepciones que mantener sincronizada página por página.

## Reglas de acceso a herramientas por usuario final

Además del RBAC administrativo, cada herramienta publicada tiene sus propias
reglas de acceso para usuarios finales, definidas por `accessRulesSchema`
(`lib/validation/tools.ts`) y almacenadas en `tool_access_rules` por versión
de herramienta publicada:

```ts
export const accessRulesSchema = z.object({
  mode: z.enum(["ALL_USERS", "SELECTED_USERS", "GROUPS", "ROLES", "INVITATION", "REQUEST_APPROVAL"]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  quota: z.number().int().min(0).optional(),
  waitlistEnabled: z.boolean(),
  gracePeriodDays: z.number().int().min(0),
  allowedHours: z.object({ start: z.string(), end: z.string() }).nullable(),
  allowedCountries: z.array(z.string().length(2)).default([]),
  featureFlagKey: z.string().max(80).optional(),
});
```

La resolución real ocurre en `lib/tools/access.ts`, función
`resolveCatalogState({ toolId, userId })` (y su versión por lotes
`resolveCatalogStates`, que evita el N+1 al resolver el catálogo completo de
una vez — ver §46). El orden de evaluación es:

1. **Estado de la herramienta**: si está `PAUSED`/`SUSPENDED`/no publicada,
   se corta ahí (`PAUSED`, `SUSPENDED`, `COMING_SOON`) sin mirar reglas de
   acceso.
2. **Denegación explícita (§21)**: `tool_assignments` con `decision: "DENY"`
   dirigida al usuario, a un grupo del que es miembro (`group_members`), o a
   un rol que tiene (`user_roles`) — **siempre gana** sobre cualquier permiso
   más amplio otorgado por el modo de acceso general. Resultado: `SUSPENDED`.
3. **Ventana temporal**: `startsAt`/`endsAt` de la regla de acceso →
   `COMING_SOON` / `EXPIRED` si aplica.
4. **Allow explícito**: un `tool_assignments` con `decision: "ALLOW"`
   (directo, por grupo o por rol) da acceso inmediato
   (`AVAILABLE`/`ACTIVE` según si el usuario ya activó la herramienta),
   sin importar el `mode` general.
5. Si nada de lo anterior aplica, se evalúa `mode`:
   - `ALL_USERS` — acceso abierto (`AVAILABLE`/`ACTIVE`).
   - `INVITATION` — requiere una `access_request` en estado `APPROVED`;
     si no, `INVITATION_ONLY`.
   - `REQUEST_APPROVAL`, `SELECTED_USERS`, `GROUPS`, `ROLES` — las cuatro se
     tratan igual en cuanto a flujo: si ya hay una solicitud `APPROVED` →
     acceso; si hay una `PENDING` → `ACCESS_REQUESTED`; si no hay ninguna →
     `APPROVAL_REQUIRED`. La distinción entre `SELECTED_USERS`/`GROUPS`/
     `ROLES` como *quién puede ser aprobado* se resuelve mediante los
     `tool_assignments` de tipo `ALLOW` del paso 4 (subject type `USER`,
     `GROUP` o `ROLE`), no con lógica adicional en el `switch` del modo.

`canUserAccessTool(toolId, userId)` es el gate real que aplica el pipeline
conversacional (§12 paso 3): solo devuelve `true` cuando el estado resuelto
es exactamente `ACTIVE`, es decir, autorizado **y** activado explícitamente
por el usuario — tener acceso disponible (`AVAILABLE`) no basta para poder
conversar con la herramienta.

Los grupos (`groups`/`group_members` en `db/schema/rbac.ts`) son, en este
mecanismo, solo un vehículo de agrupación de usuarios para
`tool_assignments` (`subjectType: "GROUP"`) — no llevan permisos RBAC
propios; eso sigue siendo exclusivamente responsabilidad de `user_roles`.

## Acceso excepcional a contenido de conversaciones (§30)

Este es el permiso más restringido del sistema, con un flujo deliberadamente
más estricto que el resto del RBAC porque expone contenido de usuario final,
no metadatos administrativos.

**Dos permisos separados, no uno:**

- `conversations.metadata.read` — lista conversaciones (usuario, herramienta,
  estado, conteo de mensajes, fechas), **nunca** el contenido de los
  mensajes. Lo tienen `PLATFORM_ADMIN` y `SUPPORT_AGENT` — suficiente para
  operar soporte y el panel sin exponer contenido.
- `conversations.content.read` — lee el texto real de los mensajes. Solo lo
  tiene `SUPER_ADMIN`, y únicamente porque su fila en `ROLE_PERMISSIONS` es
  el arreglo completo `ALL_PERMISSIONS`; ningún otro rol lo lista de forma
  explícita.

**Capa de datos (`lib/admin/conversation-content.ts`):**

- `listConversationsForAdmin` / `getConversationSummaryForAdmin` — consultas
  que seleccionan explícitamente solo columnas de metadatos
  (`id`, `userId`, `userEmail`, `toolSlug`, `status`, `messageCount`,
  `createdAt`, `lastMessageAt`); la columna `messages.content` no aparece en
  absoluto en estas funciones.
- `readConversationContentForAdmin({ conversationId, adminId, reason })` —
  la única función que toca `messages.content`:
  - Exige `reason.trim().length >= 10` (constante `MIN_REASON_LENGTH`),
    o lanza `ValidationError`. El chequeo de permiso (`conversations.content.read`)
    lo hace la ruta, no esta función — se documenta explícitamente en el
    comentario del código que la función asume que el permiso ya fue
    verificado por el llamador.
  - Registra un evento de auditoría vía `recordAuditEvent` con
    `action: "admin.conversation.content_read"`, `reason` en su propio
    campo, y `metadata: { conversationUserId, messageCount }` — **nunca** el
    contenido de los mensajes ni fragmentos de ellos en `metadata` (la tabla
    de auditoría es legible por el rol `AUDITOR`, así que duplicar contenido
    ahí anularía el propósito del permiso separado).
  - Devuelve un `AdminMinimalMessage` reducido a `id`, `role`, `content`,
    `createdAt` — sin coste/tokens/modelo/moderación ni ids de adjuntos, es
    decir, el mínimo necesario para una revisión de soporte o seguridad, ni
    un campo operativo más.

**Capa HTTP:**

- `GET /api/v1/admin/conversations` y
  `GET /api/v1/admin/conversations/[id]` exigen
  `conversations.metadata.read`.
- `POST /api/v1/admin/conversations/[id]/content` exige
  `conversations.content.read` y valida el body con
  `z.object({ reason: z.string().min(10).max(500) })`. Es **POST**, no GET,
  a propósito: el motivo obligatorio viaja en el cuerpo, nunca en un query
  string, para que no quede grabado en logs de proxies intermedios ni en el
  historial del navegador.

**Capa de UI:**

- `app/admin/conversations/page.tsx` — lista solo metadatos; si el usuario
  no tiene `conversations.metadata.read` (comprobado sobre los permisos que
  devuelve `requireAdminAccess()`), muestra un `EmptyState` en vez de la
  lista.
- `app/admin/conversations/[id]/page.tsx` — siempre muestra los metadatos de
  la conversación, y delega el contenido a
  `components/admin/conversations/ConversationContentViewer.tsx`, pasándole
  `canReadContent={permissions.has("conversations.content.read")}`.
- `ConversationContentViewer` no precarga contenido al montar la página: el
  administrador debe escribir un motivo (mínimo 10 caracteres, validado
  también en el cliente antes de enviar) y pulsar explícitamente "Ver
  contenido (se registrará el motivo)". Cada clic es una petición real que
  vuelve a pasar por el servidor — no es una revelación del lado del
  cliente de datos ya obtenidos; el servidor vuelve a verificar el permiso y
  vuelve a escribir el evento de auditoría en cada llamada.

En conjunto, el diseño trata la lectura de contenido como una acción rara y
excepcional (nombre de permiso separado, UI que exige justificación
explícita cada vez, auditoría obligatoria sin fuga de contenido hacia esa
misma auditoría, y campos de respuesta minimizados) en vez de un permiso más
dentro del flujo normal de operación del panel.

## Buenas prácticas seguidas en el código

- **Nunca confiar en flags enviados por el cliente.** Ningún endpoint acepta
  un campo como `isAdmin`, `role` o `permissions` en el body de la petición
  para decidir autorización; el único origen de verdad es la sesión
  server-side (`requireCurrentUser`/`getCurrentSession`) resuelta contra
  `user_roles` en la base de datos en cada petición.
- **Verificación en el servidor, siempre, en cada capa.** `requireAdminAccess()`
  hace solo el filtro grueso de "¿puede ver el panel?"; cada página y cada
  ruta API bajo `/admin` vuelve a comprobar su permiso específico
  (`requireUserWithPermission`). Que una página se muestre no implica que
  todas sus acciones estén autorizadas — es defensa en profundidad, no una
  comprobación única al entrar.
- **Fallar cerrado (fail closed) y explícito.** `requirePermission` lanza
  `ForbiddenError` (403) en vez de devolver `false` para que el llamador
  decida; no hay rutas que "degraden" silenciosamente a una vista limitada
  cuando falta un permiso — o se tiene el permiso, o la petición falla.
- **Permisos como unión plana, sin jerarquía implícita.** No existe un rol
  "superior" que herede automáticamente los permisos de otro salvo
  `SUPER_ADMIN`, que los tiene todos de forma explícita
  (`ALL_PERMISSIONS`) — el resto de la matriz `ROLE_PERMISSIONS` es una
  lista cerrada por rol, revisable de un vistazo en
  `lib/permissions/definitions.ts`.
- **El permiso más específico posible por acción.** `users.suspend` es
  distinto de `users.delete`, `tools.publish` de `tools.approve`,
  `conversations.metadata.read` de `conversations.content.read` — evita que
  otorgar un permiso operativo habitual (leer, aprobar) implique conceder
  sin querer una capacidad más sensible.
- **Invariante del último `SUPER_ADMIN`.** `assertNotLastSuperAdmin` impide
  dejar la plataforma sin ningún administrador con todos los permisos,
  incluso por error humano al editar roles.
- **Auditoría sin duplicar datos sensibles.** `recordAuditEvent` documenta
  explícitamente en su propio código que nunca deben pasarse secretos,
  tokens ni contenido de conversación en `metadata`, precisamente porque esa
  tabla es legible por el rol `AUDITOR` — el registro de auditoría prueba
  *que* algo se leyó y *por qué*, sin volverse él mismo una copia del dato
  protegido.
- **RBAC declarativo y versionado en código, no editable en runtime.** Roles
  y permisos no se crean desde la UI ni desde la base de datos directamente;
  viven en `lib/permissions/definitions.ts`, se siembran de forma idempotente
  (`seed-rbac.ts`) y cualquier cambio pasa por revisión de código como el
  resto del sistema.
