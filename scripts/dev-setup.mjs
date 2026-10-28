// pnpm bootstrap — prepares a fresh clone for local development:
// 1. copies each apps/*/.env.example to .env.local when it does not exist yet;
// 2. creates the ES256 key pair for the service tokens (stage 4 PRD, decision 8):
//    the private key goes only to apps/api, the public key only to apps/tickets.
// No key is ever written to the repository. Run with --force to replace existing keys.
// (Not named "setup": `pnpm setup` is a built-in pnpm command that changes the user environment.)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

const force = process.argv.includes("--force");
const apps = ["api", "tickets"];

for (const app of apps) {
  const example = `apps/${app}/.env.example`;
  const local = `apps/${app}/.env.local`;
  if (!existsSync(local)) {
    copyFileSync(example, local);
    console.log(`Created ${local} from ${example}`);
  }
}

const apiEnv = "apps/api/.env.local";
const ticketsEnv = "apps/tickets/.env.local";
const hasKeys =
  readValue(apiEnv, "TICKETS_JWT_PRIVATE_KEY") && readValue(ticketsEnv, "TICKETS_JWT_PUBLIC_KEY");

if (hasKeys && !force) {
  console.log("Service token keys already exist (use --force to replace them).");
} else {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const encode = (pem) => Buffer.from(pem).toString("base64");
  writeValue(apiEnv, "TICKETS_JWT_PRIVATE_KEY", encode(await exportPKCS8(privateKey)));
  writeValue(ticketsEnv, "TICKETS_JWT_PUBLIC_KEY", encode(await exportSPKI(publicKey)));
  console.log("Created a new ES256 key pair for the service tokens.");
}

function readValue(file, name) {
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}

function writeValue(file, name, value) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const index = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (index >= 0) lines[index] = `${name}=${value}`;
  else lines.push(`${name}=${value}`);
  writeFileSync(file, lines.join("\n"));
}
