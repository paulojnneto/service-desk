import { SERVICE_TOKEN } from "@nexo/shared";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";

// Test helpers: a key pair like the one `pnpm bootstrap` creates, and tokens built the way the
// API signs them, with overrides to forge invalid ones.
export async function testKeys() {
  return generateKeyPair(SERVICE_TOKEN.algorithm, { extractable: true });
}

type TokenOverrides = {
  issuer?: string;
  audience?: string;
  lifetimeSeconds?: number;
  issuedSecondsAgo?: number;
  jti?: string | null;
};

export async function signTestToken(
  privateKey: CryptoKey,
  subject: string,
  overrides: TokenOverrides = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000) - (overrides.issuedSecondsAgo ?? 0);
  const jwt = new SignJWT({})
    .setProtectedHeader({ alg: SERVICE_TOKEN.algorithm })
    .setSubject(subject)
    .setIssuer(overrides.issuer ?? SERVICE_TOKEN.issuer)
    .setAudience(overrides.audience ?? SERVICE_TOKEN.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + (overrides.lifetimeSeconds ?? SERVICE_TOKEN.lifetimeSeconds));
  if (overrides.jti !== null) jwt.setJti(overrides.jti ?? crypto.randomUUID());
  return jwt.sign(privateKey);
}
