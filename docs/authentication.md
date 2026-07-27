# Autenticación

Esta guía documenta cómo funciona realmente la autenticación en la plataforma:
modelo de sesión, registro, inicio de sesión, MFA (TOTP), el requisito
obligatorio de MFA para administradores (§28), recuperación de contraseña y
cierre/revocación de sesiones. Todo lo descrito corresponde a la
implementación en `lib/auth/`, `lib/permissions/admin-guard.ts`,
`lib/security/crypto.ts` y las rutas bajo `app/api/v1/auth/`.

## Resumen del modelo de sesión

La sesión es un token opaco de alta entropía (`generateOpaqueToken()` en
`lib/auth/tokens.ts`, 32 bytes aleatorios en base64url), del que solo se
persiste el hash SHA-256 (`hashToken()`) en la tabla `sessions`. El valor en
claro únicamente vive en una cookie `httpOnly`.

Al crear una sesión (`createSession()` en `lib/auth/session.ts`) se fijan
**dos cookies**:

- `crisis_session` (nombre configurable vía `AUTH_COOKIE_NAME`): `httpOnly`,
  `secure` fuera de `development`, `sameSite: "lax"`, con `maxAge` igual a
  `SESSION_TTL_SECONDS` (por defecto 2 592 000 s = 30 días).
- `crisis_csrf` (`CSRF_COOKIE_NAME` en `lib/security/csrf.ts`): **no**
  `httpOnly` — a propósito, porque el cliente debe poder leerla con
  JavaScript para reenviarla como cabecera `X-CSRF-Token` en cada solicitud
  mutante (ver "Consideraciones de seguridad").

Cada fila de `sessions` guarda además `ipTruncated` (el último octeto IPv4
puesto a cero, o los primeros 4 grupos de una IPv6) y el `userAgent`
recortado a 300 caracteres — suficiente para auditoría, sin registrar la IP
completa del usuario.

El campo clave del modelo es `mfaVerifiedAt`:

- Si el usuario **no** tiene MFA activado, `createSession()` escribe
  `mfaVerifiedAt = now()` de inmediato: la sesión queda utilizable desde el
  primer momento.
- Si el usuario **sí** tiene MFA activado, `createSession(userId, {
  requireMfaVerification: true })` inserta la fila con `mfaVerifiedAt = null`.
  La cookie igual se fija (para que el endpoint de verificación pueda
  encontrar la sesión), pero la sesión queda "pendiente" — sin utilidad para
  el resto de la aplicación — hasta que se confirme el código TOTP.

Funciones expuestas por `lib/auth/session.ts`:

- `getCurrentSession()`: lee la cookie, busca la sesión (`loadSessionRowByToken`,
  que ya descarta sesiones `REVOKED`, expiradas, o de usuarios
  `SUSPENDED`/`BLOCKED`/`DELETED`), y **devuelve `null` si `mfaVerifiedAt` es
  nulo** — una sesión pendiente de MFA no autentica a nadie. Como
  efecto colateral hace un `lastSeenAt` fire-and-forget (no bloquea la
  respuesta si falla).
- `getPendingMfaSession()`: usada únicamente por
  `POST /api/v1/auth/mfa/login-verify`. A diferencia de la anterior, esta
  función busca la sesión **sin** exigir `mfaVerifiedAt` — es, de hecho, la
  única forma de leer ese campo cuando todavía es nulo. No se expone como
  utilidad de propósito general.
- `markSessionMfaVerified(sessionId)`: setea `mfaVerifiedAt = now()`,
  convirtiendo la sesión pendiente en una sesión utilizable.
- `destroyCurrentSession()`: marca la fila como `REVOKED` (con
  `revokedAt`) y borra ambas cookies (sesión y CSRF).
- `revokeAllUserSessions(userId)`: marca como `REVOKED` todas las sesiones
  `ACTIVE` de un usuario (usada tras un reset de contraseña; ver más abajo).
- `isMfaEnabled(userId)`: comprueba si existe una fila en `mfaCredentials`
  con `enabledAt` no nulo.

`requireCurrentUser()` (`lib/auth/current-user.ts`) es el envoltorio que usan
las rutas y Server Components protegidos: llama a `getCurrentSession()` y
lanza `UnauthorizedError` si no hay sesión válida.

## Registro y verificación de correo

`POST /api/v1/auth/register` (`app/api/v1/auth/register/route.ts`):

1. Rate limit: 5 solicitudes / 15 minutos por IP truncada
   (`register:<ip>`).
2. Valida el cuerpo contra `registerSchema` y la fortaleza de la contraseña
   con `evaluatePasswordStrength()` (ver política más abajo).
3. Normaliza el correo (`trim().toLowerCase()`) y comprueba duplicados. Si el
   correo ya existe, **responde con el mismo mensaje de éxito** (201) que en
   el caso feliz, para no revelar qué correos están registrados; solo se
   registra un evento de auditoría (`auth.register.duplicate`). El índice
   único sobre `lower(email)` y `ON CONFLICT DO NOTHING` cierran también la
   carrera entre dos registros simultáneos.
4. Crea el usuario, su perfil (`userProfiles`) y le asigna el rol `USER`
   dentro de una transacción.
5. Registra el evento de auditoría `auth.register`.

**Estado actual (importante):** la verificación de correo está
**desactivada para cuentas nuevas**: las cuentas se crean directamente
con `status: "ACTIVE"` y `emailVerifiedAt` puesto a la hora de creación, sin
generar `emailVerificationTokens` ni enviar correo de verificación.

Los endpoints de verificación de correo siguen existiendo e implementados
por completo, listos para ese momento:

- `POST /api/v1/auth/verify-email` (`{ token }`): busca el token por su hash
  en `emailVerificationTokens` (debe existir, no estar consumido y no haber
  expirado), y en una transacción marca al usuario `ACTIVE` con
  `emailVerifiedAt` y el token como `consumedAt`.
- `POST /api/v1/auth/resend-verification` (`{ email }`, 3 solicitudes / 15
  min por IP): solo genera y envía un nuevo token si el usuario existe **y**
  su estado es `PENDING_VERIFICATION`; en cualquier otro caso responde el
  mismo mensaje genérico, sin filtrar si el correo existe. El enlace enviado
  tiene la forma `${NEXT_PUBLIC_APP_URL}/verify-email?token=...` y expira a
  los `EMAIL_VERIFICATION_TTL_SECONDS` (por defecto 86 400 s = 24 h).

Mientras el flujo de registro no vuelva a generar cuentas
`PENDING_VERIFICATION`, estos dos endpoints quedan efectivamente sin una vía
de entrada normal para producir el estado que consumen — pero el chequeo de
`login` (`user.status === "PENDING_VERIFICATION"` → `403
EMAIL_NOT_VERIFIED`) y ambas rutas se mantienen intactos.

### Política de contraseña

`evaluatePasswordStrength()` (`lib/auth/password.ts`) exige: al menos 10
caracteres, una minúscula, una mayúscula y un dígito. Se aplica tanto en
registro como en `reset-password`. El hash se calcula con **Argon2**
(`@node-rs/argon2`, `hash`/`verify`), con `memoryCost: 19456`, `timeCost: 2`,
`parallelism: 1`.

## Inicio de sesión

`POST /api/v1/auth/login` (`app/api/v1/auth/login/route.ts`):

1. Rate limit: 20 solicitudes / 15 min por IP truncada (`login:<ip>`).
2. Busca el usuario por correo normalizado. Si no existe, registra
   `login_failed_unknown_email` y responde el mismo error genérico
   (`INVALID_CREDENTIALS`, 401) que una contraseña incorrecta — nunca se
   distingue "usuario no existe" de "contraseña incorrecta".
3. Si `lockedUntil` está en el futuro, responde `423 ACCOUNT_LOCKED` sin
   siquiera comprobar la contraseña.
4. Verifica la contraseña con Argon2. Si falla: incrementa
   `failedLoginAttempts`; al llegar a **5 intentos** fija `lockedUntil` a
   **15 minutos** en el futuro. Responde siempre el mismo error genérico.
5. Si el usuario está `PENDING_VERIFICATION` → 403 `EMAIL_NOT_VERIFIED`. Si
   está `SUSPENDED`/`BLOCKED`/`DELETED` → 403 `ACCOUNT_UNAVAILABLE`.
6. Contraseña correcta: resetea `failedLoginAttempts`/`lockedUntil` y
   actualiza `lastLoginAt`.
7. Comprueba `isMfaEnabled(user.id)` y llama a
   `createSession(user.id, { requireMfaVerification: mfaEnabled })`.
8. Si el usuario tiene MFA: registra `auth.login.mfa_pending` y responde
   `{ mfaRequired: true }` **sin** exponer datos del usuario todavía. Si no
   tiene MFA: registra `auth.login` y responde
   `{ user: { id, email, displayName } }` — sesión ya utilizable.

### Secuencia — login normal (sin MFA)

1. El usuario envía correo y contraseña a `POST /api/v1/auth/login`.
2. El servidor valida credenciales, crea la sesión con
   `mfaVerifiedAt = now()` y fija las cookies `crisis_session` y
   `crisis_csrf`.
3. La respuesta incluye los datos del usuario; el cliente navega a
   `/dashboard` (o a `next` si venía de una redirección).

### Secuencia — login con MFA requerido

1. El usuario envía correo y contraseña a `POST /api/v1/auth/login`.
2. El servidor valida credenciales, detecta `isMfaEnabled = true`, crea la
   sesión con `mfaVerifiedAt = null` y fija igualmente ambas cookies.
   Responde `{ mfaRequired: true }` (sin datos del usuario).
3. El formulario de login (`app/(public)/login/page.tsx`) detecta
   `mfaRequired` y muestra el paso `MfaStep`, pidiendo un código de 6 dígitos
   o un código de recuperación.
4. El cliente envía el código a `POST /api/v1/auth/mfa/login-verify`.
5. El servidor localiza la sesión pendiente vía `getPendingMfaSession()`
   (usa la misma cookie de sesión ya fijada en el paso 2), valida el código
   TOTP o, si no es un código de 6 dígitos válido, intenta consumirlo como
   código de recuperación.
6. Si es válido, llama a `markSessionMfaVerified()`; la sesión existente
   pasa a estar activa (no se emite cookie nueva). Responde con los datos
   del usuario y el cliente navega al destino final.

## Autenticación de dos factores (TOTP)

Implementación propia en `lib/auth/totp.ts` (sin librerías de terceros para
TOTP):

- **Secreto**: `generateBase32Secret()` genera 20 bytes aleatorios
  (`crypto.randomBytes`) y los codifica a Base32 (alfabeto RFC 4648 sin
  padding) a mano, bit a bit.
- **HOTP**: `hotp(secret, counter)` calcula HMAC-SHA1 sobre el contador de
  pasos (8 bytes big-endian), aplica el "dynamic truncation" estándar
  (offset = últimos 4 bits del HMAC) y reduce módulo 10⁶ para obtener 6
  dígitos.
- **TOTP**: el contador es `floor(tiempoUnixMs / 1000 / 30)` — pasos de 30
  segundos (`TOTP_STEP_SECONDS`), 6 dígitos (`TOTP_DIGITS`).
  - `generateTotpCode(secret, at?)`: calcula el código vigente (usado por
    pruebas/herramientas que necesitan iniciar sesión como una cuenta con
    MFA, igual que lo haría una app autenticadora real).
  - `verifyTotpCode(secret, code, at?)`: exige exactamente 6 dígitos y
    acepta el paso actual **más un paso de deriva de reloj en cualquier
    dirección** (`drift ∈ {0, -1, 1}`), comparando con
    `timingSafeEqual` para evitar timing attacks.
- **URL `otpauth://`**: `buildOtpAuthUrl({ secret, email, issuer })` produce
  `otpauth://totp/<issuer>:<email>?secret=...&issuer=...&digits=6&period=30`,
  el formato que leen apps como Google Authenticator, Authy o 1Password.
- **Códigos de recuperación**: `generateRecoveryCodes(count = 8)` genera 8
  códigos de un solo uso (5 bytes aleatorios en hexadecimal cada uno).

### Almacenamiento del secreto (cifrado en reposo)

El secreto TOTP en claro **nunca** se persiste. `lib/security/crypto.ts`
implementa `encryptSecret`/`decryptSecret` con **AES-256-GCM**:

- La clave se deriva con `SHA-256(APP_SECRET_KEY)` (`deriveKey()`) — no se
  usa `APP_SECRET_KEY` directamente como clave.
- Cada cifrado usa un IV aleatorio de 12 bytes; el payload almacenado es
  `iv_base64.authTag_base64.datosCifrados_base64`.
- La tabla `mfaCredentials` guarda `secretEncrypted` (este payload) y
  `recoveryCodesHash` (solo los **hashes** SHA-256 de los códigos de
  recuperación, vía `hashToken()` de `lib/auth/tokens.ts` — nunca el código
  en claro).

### Flujo de activación (setup)

1. `POST /api/v1/auth/mfa/setup` (requiere sesión válida vía
   `requireCurrentUser()`): borra cualquier intento previo sin confirmar en
   `mfaCredentials`, genera un secreto nuevo, lo cifra y lo inserta (sin
   `enabledAt` — todavía no está activo). Responde `{ secret, otpauthUrl }`
   para que el cliente muestre el QR/clave manual.
2. `POST /api/v1/auth/mfa/verify` (`{ code }`, sesión requerida): descifra el
   secreto de la fila pendiente, valida el código de 6 dígitos con
   `verifyTotpCode`. Si es correcto, genera los 8 códigos de recuperación,
   guarda sus hashes y fija `enabledAt = now()`. Responde
   `{ recoveryCodes }` **en texto claro, una única vez** — no se pueden
   recuperar después porque solo se guarda el hash.
3. `POST /api/v1/auth/mfa/disable` (sesión requerida): borra la fila de
   `mfaCredentials` del usuario, desactivando MFA de inmediato.

### UI: `components/profile/MfaSetupPanel.tsx`

Panel con tres pasos (`status` → `setup` → `recovery`):

- **status**: muestra si MFA está activo; si `requiredForAdmin` es cierto y
  aún no está activo, muestra una alerta de que es obligatorio para el panel
  admin. Botón para activar o desactivar (con confirmación `window.confirm`
  al desactivar).
- **setup**: tras llamar a `mfa/setup`, muestra la clave manual y la URL
  `otpauth://` para escanear, y un formulario para confirmar con el código
  de 6 dígitos (llama a `mfa/verify`).
- **recovery**: se muestra una sola vez tras activar MFA con éxito, con los
  8 códigos de recuperación en texto plano y un botón "Continuar" que
  redirige a `/admin` (si el setup era obligatorio para un admin) o a
  `/profile`.

La página `app/(user)/profile/mfa-setup/page.tsx` es un Server Component que
llama a `requireCurrentUser()` e `isMfaEnabled()`, y pasa el estado
(`initialEnabled`, `requiredForAdmin` según `?required=admin`) al panel.

### Login-verify: TOTP o código de recuperación

`POST /api/v1/auth/mfa/login-verify` (`app/api/v1/auth/mfa/login-verify/route.ts`):

1. Rate limit: 10 solicitudes / 15 min por IP truncada.
2. Requiere una sesión pendiente (`getPendingMfaSession()`); si no la hay,
   401.
3. Si el código enviado son 6 dígitos, se prueba primero como TOTP
   (`verifyTotpCode`).
4. Si no valida como TOTP, se prueba como código de recuperación: se
   compara el hash del código enviado contra `recoveryCodesHash`; si
   coincide, se marca como usado eliminándolo del arreglo almacenado (uso
   único).
5. Si ninguna de las dos vías valida, registra el evento de seguridad
   `mfa_login_verify_failed` y responde `400 INVALID_MFA_CODE`.
6. Si valida, llama a `markSessionMfaVerified()` y responde con los datos
   del usuario.

## MFA obligatorio para administradores (§28)

El único punto de paso hacia el panel `/admin` es
`requireAdminAccess()` (`lib/permissions/admin-guard.ts`), invocado por el
layout/páginas del subárbol admin:

1. Exige sesión (`getCurrentSession()`); sin sesión → `redirect("/login")`.
2. Calcula los permisos del usuario (`getUserPermissions`) y exige que tenga
   **al menos uno** de un conjunto de permisos "de administración"
   (`users.read`, `tools.read`, `knowledge.read`, `providers.read`,
   `analytics.read`, `audit.read`, `security.read`, `settings.manage`); si
   no tiene ninguno → `redirect("/dashboard")`. Esta es solo la comprobación
   gruesa de "puede ver el panel admin"; cada página/ruta admin sigue
   verificando su propio permiso específico server-side.
3. **Si el usuario no tiene MFA activado, redirige a
   `/profile/mfa-setup?required=admin`** — sin excepción, y sin importar cuál
   de los permisos anteriores tenga. Esto es lo que hace el requisito
   "MFA obligatorio para administradores" real: no es una casilla en el rol,
   sino una comprobación que se ejecuta en el único punto por el que pasa
   cualquier acceso al panel admin, así que no existe una ruta admin que
   pueda alcanzarse sin pasar por ella.

Al llegar a `/profile/mfa-setup?required=admin`, el panel
(`MfaSetupPanel`) marca `requiredForAdmin = true`: muestra la alerta de
obligatoriedad y, al completar la activación, redirige de vuelta a `/admin`
en lugar de a `/profile`.

### Secuencia — administrador sin MFA accede a `/admin` por primera vez

1. El usuario con un rol/permiso admin (pero sin MFA) navega a `/admin`.
2. El layout/página admin invoca `requireAdminAccess()`.
3. La sesión es válida y el usuario tiene al menos un permiso admin, así que
   pasa las dos primeras comprobaciones.
4. `isMfaEnabled(session.id)` es `false` → redirección a
   `/profile/mfa-setup?required=admin`.
5. El usuario completa el asistente de activación (escanear/ingresar
   secreto, confirmar código de 6 dígitos, guardar los códigos de
   recuperación mostrados una única vez).
6. Al terminar, el panel lo redirige de vuelta a `/admin`; esta vez
   `requireAdminAccess()` encuentra `isMfaEnabled = true` y deja pasar la
   solicitud.

## Recuperación de contraseña

- `POST /api/v1/auth/forgot-password` (`{ email }`, 5 solicitudes / 15 min
  por IP): si el usuario existe y no está `DELETED`/`BLOCKED`, genera un
  token opaco, guarda su hash en `passwordResetTokens` (con la IP truncada
  como `requestIp`) con expiración `PASSWORD_RESET_TTL_SECONDS` (por defecto
  3600 s = 1 h), y envía un correo con el enlace
  `${NEXT_PUBLIC_APP_URL}/reset-password?token=...`. En cualquier otro caso
  responde exactamente el mismo mensaje genérico, sin revelar si el correo
  existe.
- `POST /api/v1/auth/reset-password` (`{ token, password }`): valida la
  fortaleza de la nueva contraseña, busca el token por hash (debe existir,
  no estar consumido, no haber expirado) → `400 INVALID_TOKEN` si falla
  cualquiera de esas condiciones. En una transacción: actualiza el hash de
  contraseña del usuario y resetea `failedLoginAttempts`/`lockedUntil`, y
  marca el token como consumido. **Después revoca todas las sesiones
  activas del usuario** (`revokeAllUserSessions`) — un reset de contraseña
  es tratado como señal fuerte para invalidar cualquier sesión existente,
  incluida la que pudiera estar comprometida. Registra el evento de
  seguridad `password_reset_completed`.

## Cierre de sesión y revocación

- `POST /api/v1/auth/logout`: llama a `destroyCurrentSession()` (marca la
  fila `REVOKED` con `revokedAt`, borra ambas cookies) y registra
  `auth.logout` si había una sesión activa.
- `GET /api/v1/auth/session`: endpoint de solo lectura que devuelve
  `{ user: null }` o los datos básicos de la sesión actual — usado por el
  cliente para hidratar el estado de autenticación sin exponer nada
  sensible.
- **Revocación administrativa**: un administrador con el permiso
  `users.suspend` puede forzar el cierre de todas las sesiones activas de
  otro usuario vía `POST /api/v1/admin/users/[id]/sessions/revoke`
  (`app/api/v1/admin/users/[id]/sessions/revoke/route.ts`), que delega en
  `revokeUserSessions(userId, actorId)`
  (`lib/admin/users-service.ts`). Esta función marca `REVOKED` todas las
  sesiones `ACTIVE` del usuario objetivo y registra el evento de auditoría
  `user.sessions.revoke` con el `actorId` del administrador que la ejecutó.
  A diferencia de `destroyCurrentSession()`, esta ruta no depende de una
  cookie propia: opera directamente sobre las sesiones del usuario objetivo
  por su `id`.

## Consideraciones de seguridad

- **Contraseñas**: hash Argon2 (`@node-rs/argon2`), nunca en texto plano;
  política mínima de longitud/complejidad aplicada en registro y reset.
- **Secretos MFA cifrados en reposo**: AES-256-GCM con clave derivada de
  `APP_SECRET_KEY` (`lib/security/crypto.ts`); los códigos de recuperación
  solo se guardan como hash SHA-256 y se muestran en claro una única vez.
- **Tokens opacos + hash**: sesión, verificación de correo y reset de
  contraseña comparten el mismo patrón — el valor en claro solo existe en
  la cookie o el enlace enviado por correo; en base de datos solo se
  persiste su hash SHA-256 (`lib/auth/tokens.ts`).
- **Cookie de sesión `httpOnly`, cookie CSRF no `httpOnly`**: la cookie de
  sesión (`crisis_session`) es `httpOnly` — inaccesible desde JavaScript,
  lo que mitiga robo vía XSS. La cookie CSRF (`crisis_csrf`) es
  deliberadamente **no** `httpOnly`, porque el mecanismo de doble envío
  (double-submit cookie, `lib/security/csrf.ts`) exige que el cliente pueda
  leerla para reenviarla como cabecera `X-CSRF-Token`; un atacante
  cross-site puede disparar la petición pero nunca leer esa cookie
  (protección same-origin del navegador) ni fijar una cabecera personalizada
  en un envío simple de formulario, así que no puede producir un par
  cookie/cabecera válido. La comprobación real ocurre en `middleware.ts`
  para todo método mutante (`POST`/`PUT`/`PATCH`/`DELETE`) bajo `/api/`,
  salvo las rutas exentas (`register`, `login`, `logout`, `verify-email`,
  `resend-verification`, `forgot-password`, `reset-password`, `cron/*`) que
  legítimamente no tienen sesión previa o usan otro mecanismo de
  autenticación (el secreto bearer de los cron jobs).
- **Ambas cookies son `secure`** fuera de `APP_ENV=development` y usan
  `SameSite=Lax`, que ya bloquea el caso clásico de POST cross-site vía
  `<form>`; el CSRF de doble cookie es una capa independiente adicional, no
  un sustituto.
- **IP truncada, nunca completa**: `truncateIp()` pone a cero el último
  octeto IPv4 o conserva solo los primeros 4 grupos de una IPv6 antes de
  guardarla junto a la sesión — suficiente para auditoría gruesa, sin
  almacenar la IP exacta del usuario.
- **Rate limiting por IP** en todos los endpoints sensibles a fuerza bruta
  o enumeración: `register` (5/15min), `login` (20/15min),
  `mfa/login-verify` (10/15min), `forgot-password` (5/15min),
  `resend-verification` (3/15min) — implementado en
  `lib/security/rate-limit.ts` como contador de ventana fija sobre Upstash
  Redis (`REDIS_URL`/`REDIS_TOKEN`), con una alternativa en memoria solo
  para desarrollo local (no válida entre instancias, y con advertencia
  explícita si se usa en producción sin Redis configurado).
- **Bloqueo de cuenta tras intentos fallidos**: 5 intentos fallidos de
  contraseña bloquean la cuenta 15 minutos (`lockedUntil`), independiente
  del rate limit por IP — protege contra fuerza bruta distribuida entre
  varias IPs contra una sola cuenta.
- **Respuestas que no filtran información**: registro, login,
  forgot-password y resend-verification devuelven mensajes idénticos tanto
  si el correo/cuenta existe como si no, para no permitir enumerar cuentas
  registradas.
- **Revocación de sesiones como respuesta a incidentes**: tanto un reset de
  contraseña exitoso como la acción administrativa "revocar sesiones"
  invalidan de inmediato todas las sesiones activas del usuario afectado, sin
  esperar a que expiren por TTL.
