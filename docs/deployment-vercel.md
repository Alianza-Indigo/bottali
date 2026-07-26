# Despliegue en Vercel

Esta guía cubre cómo llevar la plataforma a producción en Vercel: qué servicios
externos aprovisionar, qué variables de entorno configurar, y cómo verificar
que el despliegue quedó correctamente configurado antes de anunciarlo como
listo.

## 1. Servicios externos requeridos

La plataforma es "bring your own backend": cada pieza tiene una interfaz
desacoplada con una implementación real y (en desarrollo) una alternativa
falsa/local. En producción, todas deben apuntar a un servicio real:

| Pieza | Servicio recomendado | Variable(s) |
|---|---|---|
| Base de datos | Vercel Postgres o Neon | `DATABASE_URL`, `DATABASE_POOL_URL` |
| Archivos | Vercel Blob | `BLOB_READ_WRITE_TOKEN` |
| Rate limiting | Upstash Redis (REST) | `REDIS_URL`, `REDIS_TOKEN` |
| Trabajos asíncronos | Vercel Cron (ya incluido en `vercel.json`) | `JOB_PROVIDER=vercel-queue`, `CRON_SECRET` |
| LLM / embeddings / moderación / voz | Cualquier endpoint compatible con OpenAI | `LLM_API_KEY`, `EMBEDDING_API_KEY`, etc. |
| Email | SMTP real (Postmark, Resend, SES, etc.) | `EMAIL_PROVIDER=smtp`, `SMTP_*` |

Sin estos, el arranque en producción falla rápido y con un mensaje claro
(`getEnv()` valida el esquema; `getStorageAdapter()` lanza explícitamente si
falta `BLOB_READ_WRITE_TOKEN` en producción) en lugar de degradar
silenciosamente a un almacenamiento local que no persiste entre invocaciones
serverless.

## 2. Variables de entorno

Copia `.env.example` como referencia. Las variables marcadas como
**obligatorias en producción** deben configurarse en el dashboard de Vercel
(Project Settings → Environment Variables) para el entorno `Production` (y
`Preview` si se usan preview deployments contra datos reales).

### Núcleo

- `APP_ENV=production` — activa las validaciones estrictas de producción.
- `APP_SECRET_KEY` — cadena aleatoria de al menos 32 caracteres
  (`openssl rand -hex 32`). Usada para derivar claves HMAC/cifrado.
- `NEXT_PUBLIC_APP_URL` — URL pública completa con `https://`.
- `DATABASE_URL` / `DATABASE_POOL_URL` — cadena de conexión Postgres.

### Almacenamiento y rate limiting (obligatorios en producción)

- `BLOB_READ_WRITE_TOKEN` — token de Vercel Blob.
- `REDIS_URL` / `REDIS_TOKEN` — credenciales REST de Upstash Redis.

### Trabajos asíncronos

- `JOB_PROVIDER=vercel-queue` — usa cron polling en vez de ejecución inline
  (obligatorio: las funciones de Vercel no mantienen estado entre requests).
- `CRON_SECRET` — Vercel llama a los endpoints `/api/v1/cron/*` con
  `Authorization: Bearer $CRON_SECRET`; debe coincidir.

### Proveedores de IA

- `LLM_PROVIDER=openai-compatible` + `LLM_API_KEY` + `LLM_API_BASE_URL` +
  `LLM_DEFAULT_MODEL`. Lo mismo aplica a `EMBEDDING_PROVIDER`,
  `MODERATION_PROVIDER`, `STT_PROVIDER`, `TTS_PROVIDER` si se habilitan voz.
- Dejar cualquiera en su valor `fake` es válido para un entorno de
  demostración, pero `scripts/verify-env.ts` **falla el chequeo** (exit code 1,
  bloqueante) si `APP_ENV=production` y cualquiera de `LLM_PROVIDER`,
  `EMBEDDING_PROVIDER`, `MODERATION_PROVIDER`, `STT_PROVIDER` o
  `TTS_PROVIDER` sigue en `fake`. `STT_PROVIDER`/`TTS_PROVIDER` sí aceptan
  `disabled` en producción si la herramienta no usa voz.

### Email

- `EMAIL_PROVIDER=smtp` + `SMTP_HOST` + `SMTP_PORT` + `SMTP_USERNAME` +
  `SMTP_PASSWORD` + `EMAIL_FROM`. El valor por defecto (`console`) solo
  imprime el correo a stdout — nunca lo entrega — y es exclusivo para
  desarrollo.

### Flags y límites

`ENABLE_VOICE`, `ENABLE_FILES`, `ENABLE_PWA`, `ENABLE_ANALYTICS`,
`MAX_UPLOAD_BYTES`, `SIGNED_URL_TTL_SECONDS`,
`DEFAULT_DAILY_MESSAGE_LIMIT`, `DEFAULT_MONTHLY_TOKEN_LIMIT`,
`DEFAULT_MONTHLY_COST_LIMIT_CENTS` — valores por defecto razonables para
producción; ajustar según necesidad de negocio.

## 3. Pasos de despliegue

1. **Crear el proyecto en Vercel** apuntando a este repositorio.
2. **Aprovisionar Postgres, Blob y Upstash Redis** desde el marketplace de
   integraciones de Vercel (o servicios externos) y copiar las credenciales
   resultantes a las variables de entorno del proyecto.
3. **Configurar el resto de variables** de la sección 2 en
   Project Settings → Environment Variables.
4. **Ejecutar las migraciones** contra la base de datos de producción antes
   del primer despliegue (o como paso de build):
   ```bash
   DATABASE_URL=... npm run db:migrate
   ```
5. **Sembrar el catálogo de roles/permisos y proveedores** (idempotente,
   seguro de repetir):
   ```bash
   DATABASE_URL=... npm run db:seed
   ```
   En `APP_ENV=production` este script omite automáticamente los datos de
   demostración (usuarios/herramientas de ejemplo) y solo siembra RBAC,
   catálogo de proveedores y el aviso de privacidad por defecto.
6. **Verificar las variables de entorno** antes de desplegar:
   ```bash
   npm run env:check
   ```
   Falla con una lista explícita de lo que falta si `APP_ENV=production` y
   algo obligatorio no está configurado.
7. **Desplegar** (`vercel --prod` o vía integración Git). `vercel.json`
   declara un único cron consolidado (`/api/v1/cron/daily`, una vez al día)
   que ejecuta en secuencia el procesamiento de trabajos en cola, las
   publicaciones programadas, la limpieza de archivos/confirmaciones
   expiradas, la retención y el chequeo de salud de proveedores — el plan
   Hobby de Vercel limita los crons a frecuencia diaria; con un plan de pago
   puede volver a dividirse en crons más frecuentes si la carga lo justifica.
8. **Generar los íconos de PWA** si no están versionados o si cambia la
   marca (`npm run pwa:icons`); son estáticos y se sirven desde `public/`.

## 4. Verificación post-despliegue

- `GET /api/v1/health/live` — liveness básico, sin dependencias.
- `GET /api/v1/health/ready` — verifica conexión a base de datos.
- `GET /api/v1/health/dependencies` — verifica DB, Redis y storage.
- Confirmar que las cabeceras de seguridad (CSP, `X-Frame-Options`,
  `Strict-Transport-Security`, etc.) llegan en las respuestas — se generan en
  `next.config.ts` y no requieren configuración adicional en Vercel.
- Confirmar que un cron job se ejecutó (Vercel → Project → Cron Jobs →
  ver historial) y que `/api/v1/admin/jobs` en el panel admin muestra
  trabajos `COMPLETED`.
- Iniciar sesión con una cuenta real, activar una herramienta publicada y
  enviar un mensaje para confirmar que el proveedor de IA configurado
  responde (si `LLM_PROVIDER=fake`, la respuesta determinista es esperada,
  no un error).

## 5. Desarrollo local

```bash
cp .env.example .env.local   # completar con una base Postgres local
npm install
npm run db:migrate
npm run db:seed              # crea roles, proveedores, y en desarrollo
                              # además usuarios/herramientas de demostración
                              # (ver credenciales en la salida del comando)
npm run dev
```

Suites de prueba:

```bash
npm run test              # unit
npm run test:integration  # integración, requiere la misma Postgres local
npm run test:e2e          # build + Playwright (e2e, accesibilidad axe, seguridad)
npm run lint
npm run typecheck
npm run build
```
