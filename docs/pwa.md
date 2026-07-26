# PWA (Progressive Web App)

Esta guía documenta la implementación real de PWA en la plataforma: el shell
instalable a nivel de plataforma (uno solo, siempre activo) y el manifest
dinámico por herramienta (opcional, por versión publicada).

## 1. Resumen

Hay dos niveles de PWA completamente independientes:

1. **Shell de la plataforma** — un único manifest estático
   (`/manifest.webmanifest`), un service worker (`public/sw.js`) y una página
   offline (`public/offline.html`). Se registra siempre, para toda la
   aplicación, sin importar qué herramientas existan o qué capacidades tengan
   habilitadas. Permite instalar "Plataforma de Herramientas Conversacionales"
   como app y navegar con una página de respaldo cuando no hay red.

2. **Manifest dinámico por herramienta** — cuando la versión publicada de una
   herramienta tiene la capacidad `pwa` activada y una `pwaConfig` guardada,
   la página de chat de esa herramienta (`/tools/[slug]/chat`) sirve su
   *propio* `<link rel="manifest">` apuntando a
   `/api/v1/catalog/[id]/manifest`, generado en cada request a partir de la
   configuración de la versión publicada (nunca un archivo estático). Esto
   permite instalar una herramienta concreta como su propia app, con su
   nombre, icono, `start_url` y `scope`, en vez de instalar la plataforma
   completa.

Ambos niveles comparten el mismo service worker de plataforma (no hay un SW
por herramienta) y la misma página offline.

## 2. Shell de la plataforma

### 2.1 Manifest raíz

`app/manifest.ts` usa el soporte nativo de metadata de Next.js
(`MetadataRoute.Manifest`) para servir `/manifest.webmanifest`:

```ts
{
  name: "Plataforma de Herramientas Conversacionales",
  short_name: "Crisis Platform",
  description: "Panel para descubrir y usar herramientas conversacionales basadas en IA.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "any",
  background_color: "#ffffff",
  theme_color: "#1d4ed8",
  icons: [ /* icon-192, icon-512, icon-maskable-512 */ ],
}
```

`app/layout.tsx` referencia este manifest (`metadata.manifest =
"/manifest.webmanifest"`), declara `appleWebApp: { capable: true,
statusBarStyle: "default", title: "Crisis Platform" }` y expone los íconos
`icon`/`apple` en `metadata.icons`. `viewport.themeColor` se fija en el mismo
`#1d4ed8` que el manifest.

### 2.2 Service worker

`public/sw.js` es el único service worker de toda la aplicación (registrado
por `components/pwa/ServiceWorkerRegistration.tsx`, incluido en
`app/layout.tsx`). Su alcance está deliberadamente limitado:

- **Se cachea (`SHELL_CACHE = "shell-v1"`)**: el shell de la app
  (`/_next/static/`), `/icons/`, `/images/` y `/manifest.webmanifest` —
  cacheado bajo demanda la primera vez que se piden (estrategia
  cache-first-con-relleno), más una precarga inicial en el evento `install`
  de `OFFLINE_URL`, los tres íconos y `manifest.webmanifest`.
- **Nunca se intercepta**: cualquier request a `/api/` o `/_next/data/`
  (`isNeverIntercepted`) pasa siempre directo a la red — sesiones, tokens,
  conversaciones, archivos y cualquier dato con estado no pasan jamás por el
  service worker. Tampoco se intercepta ningún request que no sea `GET`.
- **Navegación (`request.mode === "navigate"`)**: intenta red primero; si
  falla, responde con la página offline cacheada (`caches.match(OFFLINE_URL)`).
- **Activación**: el `activate` borra cualquier cache que no sea
  `SHELL_CACHE` (invalidación de versiones previas), pero deliberadamente
  **no** llama a `clients.claim()` — el worker solo controla navegaciones
  futuras, nunca la página que acaba de registrarlo, para no competir con
  peticiones de recursos ya en vuelo durante la hidratación.
- **Actualización**: el worker escucha `message === "SKIP_WAITING"` para
  activarse de inmediato cuando el usuario lo pide.

`ServiceWorkerRegistration.tsx` registra `/sw.js` en el evento `load` (nunca
antes, por la misma razón de no competir con la carga en curso), detecta
`controllerchange` para recargar la página una sola vez tras una actualización
real, y muestra un aviso ("Hay una nueva versión de la plataforma disponible."
+ botón "Actualizar ahora") cuando detecta un worker `waiting` — al pulsarlo
envía `SKIP_WAITING` al worker en espera.

### 2.3 Página offline

`public/offline.html` es una página estática independiente (no una ruta de
Next.js) con estilos inline para claro/oscuro (`prefers-color-scheme`),
mensaje "Estás sin conexión" aclarando que sesión, conversaciones y archivos
requieren conexión, y un botón "Reintentar" que recarga la página. Es el
`OFFLINE_URL` que el service worker sirve como fallback de navegación.

### 2.4 Íconos

Generados por `scripts/generate-pwa-assets.ts` (comando `npm run pwa:icons`,
mencionado en `docs/deployment-vercel.md`), usando `sharp` para rasterizar un
SVG generado en memoria (rectángulo de fondo `#ffffff`, rectángulo interior
redondeado `#1d4ed8` con el monograma `"CP"`). Salida en `public/icons/`:

| Archivo | Tamaño | Padding | Propósito |
|---|---|---|---|
| `icon-192.png` | 192×192 | 0 | icono estándar |
| `icon-512.png` | 512×512 | 0 | icono estándar (alta resolución) |
| `icon-maskable-512.png` | 512×512 | 64px | `purpose: "maskable"` — el glifo se mantiene dentro de la zona segura (~80%) porque el SO puede recortar el icono a formas arbitrarias |
| `apple-touch-icon.png` | 180×180 | 0 | icono para iOS (`apple-touch-icon`) |

Son archivos estáticos versionados en `public/icons/`; el script se re-ejecuta
manualmente solo si cambia la marca.

## 3. Manifest dinámico por herramienta

### 3.1 Esquema `pwaConfig`

Definido como `pwaConfigSchema` en `lib/validation/tools.ts` (líneas
151-169), es parte de la configuración versionada de cada herramienta
(tabla `tool_pwa_configs`, una fila por versión vía
`lib/tools/repository.ts`):

| Campo | Tipo / validación | Rol |
|---|---|---|
| `name` | string, 1-120 | `name` del manifest |
| `shortName` | string, 1-40 | `short_name` |
| `description` | string, 1-280 | `description` |
| `themeColor` | `#rrggbb` | `theme_color` |
| `backgroundColor` | `#rrggbb` | `background_color` |
| `startUrl` | string, 1-200 | `start_url` |
| `scope` | string, 1-200 | `scope` de la PWA instalada |
| `display` | `standalone` \| `fullscreen` \| `minimal-ui` \| `browser` | `display` |
| `orientation` | `any` \| `portrait` \| `landscape` | `orientation` |
| `shortcuts` | hasta 4 `{ name, url }` | `shortcuts` del manifest |
| `screenshots` | hasta 8 URLs | `screenshots` (para UI de instalación enriquecida) |
| `offlinePageUrl` | string, hasta 200 | página offline propia de la herramienta (configurable, por defecto `/offline.html` en el formulario admin) |
| `updatePolicy` | `prompt` \| `auto` | política declarada de actualización (no aplicada por un SW separado — comparte el SW de plataforma) |
| `subdomain` | string opcional, hasta 80 | reservado para servir la herramienta bajo un subdominio propio |
| `basePath` | string opcional, hasta 120 | reservado para servir la herramienta bajo una ruta base propia |
| `deepLinks` | array de strings, hasta 200 c/u | patrones de deep link declarados para la herramienta |

`subdomain` y `basePath` son campos de configuración persistidos y editables
desde el admin (formulario `PwaSection`), pero la ruta que sirve el manifest
dinámico (`app/api/v1/catalog/[id]/manifest/route.ts`) no los lee ni los
usa para construir URLs — el manifest generado usa siempre `startUrl` y
`scope` tal cual están guardados. No existe todavía un mecanismo de
enrutamiento por subdominio o base path independiente en el servidor.

### 3.2 Ruta que sirve el manifest

`GET /api/v1/catalog/[id]/manifest` (`app/api/v1/catalog/[id]/manifest/route.ts`):

1. Exige un usuario autenticado (`requireCurrentUser`).
2. Busca la herramienta por `id` y exige que tenga `publishedVersionId`
   (404 si no).
3. Verifica acceso del usuario a la herramienta (`canUserAccessTool`), 403 si
   no tiene.
4. Carga la configuración de la versión publicada (`loadVersionConfig`) y
   exige `config.pwaConfig` **y** `config.capabilities.pwa` — si falta
   cualquiera de los dos, responde 404 ("Esta herramienta no tiene PWA
   habilitada.").
5. Construye el JSON del manifest en el momento (`name`, `short_name`,
   `description`, `start_url`, `scope`, `display`, `orientation`,
   `theme_color`, `background_color`, `shortcuts`, `screenshots`) con
   `Content-Type: application/manifest+json`. Los íconos se toman de
   `config.branding.iconUrl` (192×192 y 512×512 con la misma imagen) si existe
   branding con icono propio; si no, `icons` queda como arreglo vacío.

Al ser generado por request y no un archivo estático, cualquier cambio de
`pwaConfig` o de branding surte efecto en cuanto se publica una nueva versión
de la herramienta, sin necesidad de rebuild ni de reinvalidar cache de CDN.

### 3.3 Cómo se conecta la página de la herramienta

`app/(user)/tools/[slug]/chat/page.tsx` genera su propio `<link
rel="manifest">` vía `generateMetadata`: consulta la herramienta y su versión
publicada, y **solo si `toolCapabilities.pwa` es `true`** en esa versión,
fija `metadata.manifest = /api/v1/catalog/${tool.id}/manifest`. Si la
capacidad `pwa` está desactivada (o la herramienta no tiene versión
publicada), la página no declara `manifest` propio y el navegador sigue
usando el manifest raíz heredado de `app/layout.tsx` — es decir, "Agregar a
pantalla de inicio" desde esa herramienta instalaría la plataforma completa,
no la herramienta como app independiente.

## 4. Capacidad "pwa": cómo se activa y desactiva

`capabilitiesSchema` (`lib/validation/tools.ts`, tabla `tool_capabilities`)
incluye un booleano `pwa` por versión de herramienta, editable desde el panel
admin (`CapabilitiesSection.tsx`, etiqueta `"PWA"`) junto al resto de
capacidades (`files`, `images`, `forms`, `deepLinks`, etc.).

- **Activación real**: el flag `pwa` de la versión determina, en dos puntos
  del código, si la PWA por herramienta existe de verdad:
  - `app/(user)/tools/[slug]/chat/page.tsx` — solo enlaza el manifest dinámico
    si `capabilitiesRows[0]?.pwa` es verdadero.
  - `app/api/v1/catalog/[id]/manifest/route.ts` — responde 404 si
    `config.capabilities?.pwa` es falso, incluso si la petición llega
    directamente a la URL del manifest.
- **Validación al publicar**: `lib/tools/validation-publish.ts` (línea 60)
  bloquea la publicación de una versión si `capabilities.pwa` está activado
  pero falta `pwaConfig`, o si `pwaConfig.startUrl`/`pwaConfig.scope` están
  vacíos — evita publicar una herramienta con PWA "a medias".
- **Independencia del shell de plataforma**: el shell (manifest raíz, service
  worker, offline.html) no depende de esta capacidad — está siempre activo
  para toda la aplicación, tenga o no herramientas con `pwa` habilitada.

### Variable de entorno `ENABLE_PWA`

`ENABLE_PWA` está declarada en el esquema de entorno (`lib/env.ts`, junto a
`ENABLE_VOICE`, `ENABLE_FILES` y `ENABLE_ANALYTICS`) y se valida como booleano
mediante `boolFromString`; `.env.example` la trae en `true` y
`.github/workflows/ci.yml` la fija en `"true"` para la suite de CI. A
diferencia de `ENABLE_VOICE` (consumida por `lib/ai/registry.ts`) y
`ENABLE_FILES` (consumida por `lib/files/service.ts`), en el código actual
ningún módulo lee `getEnv().ENABLE_PWA` para condicionar comportamiento: el
shell de plataforma se registra siempre y la disponibilidad de PWA por
herramienta depende exclusivamente de la capacidad `pwa` de la versión
publicada (sección anterior). `ENABLE_PWA` queda como flag de entorno
validado y documentado, sin un punto de lectura en tiempo de ejecución.

## 5. Deep links

La capacidad `deepLinks` (booleano en `capabilitiesSchema`, además del
arreglo `pwaConfig.deepLinks` con patrones declarados) habilita, en el chat de
una herramienta (`components/chat/ChatPageClient.tsx` y
`components/chat/ChatWindow.tsx`), que la conversación activa se refleje en la
URL como `?conversation={id}`:

- `ChatPageClient` inicializa `selectedId` leyendo `searchParams.get("conversation")`
  solo si `tool.capabilities.deepLinks` es verdadero, y mantiene la URL
  sincronizada con `router.replace` cada vez que cambia la conversación
  seleccionada (sin esto, la URL nunca incluye el parámetro `conversation`).
- `ChatWindow.copyShareLink` (solo visible cuando `tool.capabilities.deepLinks`
  es verdadero) arma `${origin}${pathname}?conversation=${conversationId}` y lo
  copia al portapapeles con `navigator.clipboard.writeText`, mostrando
  "¡Copiado!" durante dos segundos.

Abrir ese enlace vuelve a montar `/tools/[slug]/chat?conversation=...`; como
la página es la misma ruta de siempre (no hay una ruta de deep link separada),
el "resolver" es simplemente que `ChatPageClient` lee el parámetro de la URL
al montar y selecciona esa conversación si la capacidad está habilitada.

## 6. Instalación (prompt "Instalar")

`components/pwa/InstallPrompt.tsx`, incluido siempre en
`components/layout/AppShell.tsx`, escucha el evento nativo
`beforeinstallprompt`, hace `event.preventDefault()` para diferirlo, y
muestra una barra fija en la esquina inferior con el texto "Instala la
plataforma para acceso rápido y notificaciones." y dos botones:

- **"Ahora no"** — descarta el aviso (`dismissed = true`) sin volver a
  mostrarlo en esa sesión de página.
- **"Instalar"** — llama a `deferredEvent.prompt()`, espera
  `deferredEvent.userChoice` y limpia el evento diferido.

Este prompt es exclusivamente para el shell de plataforma (no hay un prompt
de instalación separado por herramienta); su aparición depende del propio
navegador, que solo dispara `beforeinstallprompt` cuando se cumplen sus
criterios de instalabilidad (manifest válido, service worker activo, HTTPS).

## 7. Cómo se prueba

`tests/e2e/pwa.spec.ts` (Playwright) es la referencia autoritativa de qué
está realmente verificado:

1. **Assets del shell responden 200**: `/manifest.webmanifest`, `/sw.js`,
   `/offline.html`, `/icons/icon-192.png`, `/icons/icon-512.png`,
   `/icons/icon-maskable-512.png`, `/icons/apple-touch-icon.png`.
2. **El manifest raíz trae los tres íconos requeridos**: al menos 3 entradas
   en `icons`, y al menos una con `purpose === "maskable"`.
3. **El service worker se registra y queda activo**: navega a `/login` y
   espera (`page.waitForFunction`) a que
   `navigator.serviceWorker.getRegistration()` resuelva con un `reg.active`,
   sin errores de página (`pageerror`).
4. **Manifest dinámico por herramienta**: inicia sesión como usuario demo,
   activa/abre una herramienta publicada con PWA habilitada desde `/tools`,
   navega a `/tools/{slug}/chat`, lee el `href` de
   `link[rel="manifest"]` (debe matchear
   `^/api/v1/catalog/[0-9a-f-]+/manifest$`), pide esa URL directamente y
   confirma `200` y que el JSON devuelto tiene `scope === "/tools/"`.

Se ejecuta junto al resto de la suite e2e con `npm run test:e2e` (build +
Playwright), según lo descrito en `docs/deployment-vercel.md`.
