import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import pg from "pg";

// The one-off setup of the Docker Compose stack (stage 12 tech spec), run before the API and
// the ticket service:
// 1. creates the stack's databases when missing (init.sql runs only on a new volume, and a
//    developer's volume already exists);
// 2. writes the ES256 key pair for the service tokens and the session secret when missing.
//    The private key and the secret go to the API's volume, the public key to the ticket
//    service's, as `pnpm bootstrap` splits them. Nothing is printed.
const DATABASES = ["nexo_app_api", "nexo_app_tickets"];
const API_SECRETS = "/secrets/api";
const TICKETS_SECRETS = "/secrets/tickets";

const client = new pg.Client({ connectionString: process.env.POSTGRES_URL });
await client.connect();
try {
  for (const name of DATABASES) {
    const found = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (found.rowCount === 0) {
      await client.query(`create database ${name}`);
      console.log(`Created the database ${name}.`);
    }
  }
} finally {
  await client.end();
}

if (!existsSync(`${API_SECRETS}/tickets_private_key`)) {
  // The same PEM formats as jose's exportPKCS8 and exportSPKI, base64-encoded as in .env.local.
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const encode = (pem: string) => Buffer.from(pem).toString("base64");
  writeFileSync(
    `${API_SECRETS}/tickets_private_key`,
    encode(privateKey.export({ type: "pkcs8", format: "pem" }) as string),
  );
  writeFileSync(
    `${TICKETS_SECRETS}/tickets_public_key`,
    encode(publicKey.export({ type: "spki", format: "pem" }) as string),
  );
  console.log("Created a new ES256 key pair for the service tokens.");
}

if (!existsSync(`${API_SECRETS}/session_secret`)) {
  writeFileSync(`${API_SECRETS}/session_secret`, randomBytes(32).toString("hex"));
  console.log("Created the session secret.");
}
