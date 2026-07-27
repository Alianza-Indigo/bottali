# Staging equivalente a producción

Staging debe ser un proyecto de Vercel separado que ejecute el mismo commit, comando de build y configuración funcional que producción. La diferencia está únicamente en sus credenciales y datos.

## Recursos aislados

- Base PostgreSQL propia con `DATABASE_URL` y `DATABASE_POOL_URL`.
- Instancia Redis/Upstash propia.
- Vercel Blob propio.
- Cliente OAuth de Google propio, con el callback del dominio de staging.
- Valores independientes para `APP_SECRET_KEY`, `CRON_SECRET` y secretos de proveedores.
- `APP_ENV=production` para activar exactamente las validaciones y adaptadores de producción.

No se deben compartir base de datos, Blob, Redis, secretos OAuth ni cron con producción.

## Configuración

1. Crear un segundo proyecto Vercel conectado al mismo repositorio.
2. Asignarle un dominio estable, por ejemplo `staging.bottali.alianzaindigo.org`.
3. Configurar todas las variables indicadas en [deployment-vercel.md](deployment-vercel.md), usando recursos exclusivos de staging.
4. Registrar en Google:
   - Origen JavaScript: `https://staging.bottali.alianzaindigo.org`
   - Redirect URI: `https://staging.bottali.alianzaindigo.org/api/v1/auth/google/callback`
5. Mantener el comando `vercel-build`; este aplica migraciones y genera el mismo artefacto que producción.
6. Restringir el acceso al proyecto de staging desde Vercel si contiene datos internos.

## Promoción

La rama `main` debe requerir el check **Quality gate**. Un cambio se valida primero en staging con OAuth, conversación, llamada de herramienta, archivos y cron. Producción se despliega desde el mismo commit ya validado; no se reconstruyen cambios manuales entre ambientes.
