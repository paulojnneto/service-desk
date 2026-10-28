import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type Db } from "./connect";
import * as schema from "./schema";

// A fresh in-process PostgreSQL (PGlite) with the real migrations, for tests.
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as Db;
}
