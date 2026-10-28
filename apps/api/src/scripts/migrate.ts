import { databaseUrl } from "../env";
import { applyMigrations } from "../db/connect";

// pnpm db:migrate — applies the SQL migrations in ./drizzle to DATABASE_URL.
const url = databaseUrl();
try {
  await applyMigrations(url);
  console.log("Migrations applied.");
} catch (error) {
  console.error(
    `Could not apply the migrations to ${redact(url)}. Is the database up (pnpm db:up)?`,
  );
  console.error(error);
  process.exitCode = 1;
}

function redact(url: string) {
  return url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@");
}
