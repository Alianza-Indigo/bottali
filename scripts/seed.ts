import "./load-env";

import { db } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { seedRolesAndPermissions } from "@/lib/permissions/seed-rbac";
import { syncProvidersFromEnv } from "@/lib/ai/sync-providers";
import { seedDefaultLegalDocuments } from "@/lib/legal/seed-legal";
import { seedBootstrapSuperAdmin } from "@/db/seed/bootstrap-admin";
import { seedDemoData } from "@/db/seed/demo";

async function main() {
  const env = getEnv();

  console.log("Sembrando catálogo de roles y permisos (idempotente, seguro en cualquier entorno) ...");
  await seedRolesAndPermissions(db);

  console.log("Sincronizando catálogo de proveedores de IA desde variables de entorno ...");
  await syncProvidersFromEnv(db);

  console.log("Verificando aviso de privacidad publicado ...");
  await seedDefaultLegalDocuments(db);

  console.log("Asegurando cuenta SUPER_ADMIN inicial ...");
  await seedBootstrapSuperAdmin(db);

  if (env.APP_ENV === "production") {
    console.log("APP_ENV=production: se omiten los datos de demostración.");
    return;
  }

  console.log("Sembrando datos de demostración (solo desarrollo) ...");
  await seedDemoData(db);
  console.log("Seed completo.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fallo al ejecutar el seed:", error);
    process.exit(1);
  });
