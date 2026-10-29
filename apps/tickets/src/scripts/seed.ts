import { databaseUrl } from "../env";
import { connect } from "../db/connect";
import { isEmpty, seedDatabase } from "../seed/seed";

// pnpm db:seed — replaces the data with the Annex B sample (development only).
// --if-empty seeds only a database without tickets, in production too: the Docker Compose
// stack passes it on every start, so a restart keeps what people did (stage 12 PRD, S-12.3).
const ifEmpty = process.argv.includes("--if-empty");
if (process.env.NODE_ENV === "production" && !ifEmpty) {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const { db, close } = connect(databaseUrl());
try {
  if (ifEmpty && !(await isEmpty(db))) {
    console.log("Sample data already there; nothing to do.");
  } else {
    console.log("Replacing tickets and articles with the sample data…");
    const counts = await seedDatabase(db);
    console.log(`Seeded ${counts.tickets} tickets and ${counts.articles} articles.`);
  }
} catch (error) {
  console.error("Could not seed the database. Did you run pnpm db:up and pnpm db:migrate?");
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
