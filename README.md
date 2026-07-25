# Plataforma de Herramientas Conversacionales

Plataforma para crear, configurar y operar múltiples herramientas
conversacionales basadas en IA desde un núcleo técnico y panel
administrativo compartidos. Next.js 15 (App Router) + TypeScript + Drizzle
ORM sobre PostgreSQL.

## Empezar en local

```bash
cp .env.example .env.local   # completar con una Postgres local
npm install
npm run db:migrate
npm run db:seed              # RBAC, proveedores, y datos de demo (dev)
npm run dev
```

## Pruebas

```bash
npm run test              # unit (Vitest)
npm run test:integration  # integración contra Postgres real (Vitest)
npm run test:e2e          # build + e2e / accesibilidad (axe) / seguridad (Playwright)
npm run lint
npm run typecheck
npm run build
```

## Despliegue

Ver [`docs/deployment-vercel.md`](docs/deployment-vercel.md) para variables
de entorno, servicios externos requeridos y pasos de despliegue en Vercel.
