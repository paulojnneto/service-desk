import { databaseUrl } from "../env";
import { connect } from "../db/connect";
import { seedDatabase } from "../seed/seed";

// pnpm db:seed — replaces the data with the Annex B sample (development only).
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const { db, close } = connect(databaseUrl());
try {
  console.log("Replacing tickets and articles with the sample data…");
  const counts = await seedDatabase(db);
  console.log(`Seeded ${counts.tickets} tickets and ${counts.articles} articles.`);
} catch (error) {
  console.error("Could not seed the database. Did you run pnpm db:up and pnpm db:migrate?");
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
