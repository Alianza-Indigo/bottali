import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL no está definido. Copia .env.example a .env.local y complétalo.");
    process.exit(1);
  }

  const migrationClient = postgres(url, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("Ejecutando migraciones desde db/migrations ...");
  await migrate(db, { migrationsFolder: "db/migrations" });
  console.log("Migraciones aplicadas correctamente.");

  await migrationClient.end();
}

main().catch((error) => {
  console.error("Fallo al ejecutar migraciones:", error);
  process.exit(1);
});
