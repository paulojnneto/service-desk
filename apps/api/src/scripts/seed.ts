import { connect } from "../db/connect";
import { databaseUrl } from "../env";
import { seedConversations } from "../seed/conversations";

// pnpm db:seed — replaces the sample employees' conversations (development only). Ana's
// conversation is left as it is.
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed in production.");
  process.exit(1);
}

const { db, close } = connect(databaseUrl());
try {
  console.log("Replacing the sample conversations…");
  const counts = await seedConversations(db);
  console.log(`Seeded ${counts.conversations} conversations.`);
} catch (error) {
  console.error("Could not seed the conversations. Did you run pnpm db:up and pnpm db:migrate?");
  console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
