import { connect } from "../db/connect";
import { databaseUrl } from "../env";
import { isEmpty, seedConversations } from "../seed/conversations";

// pnpm db:seed — replaces the sample employees' conversations (development only). Ana's
// conversation is left as it is.
// --if-empty seeds only a database without conversations, in production too: the Docker
// Compose stack passes it on every start, so a restart keeps what people did (stage 12 PRD,
// S-12.3).
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
    console.log("Replacing the sample conversations…");
    const counts = await seedConversations(db);
    console.log(`Seeded ${counts.conversations} conversations.`);
  }
} catch (error) {
  console.error("Could not seed the conversations. Did you run pnpm db:up and pnpm db:migrate?");
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
