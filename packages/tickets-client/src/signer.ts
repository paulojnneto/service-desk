import { SERVICE_TOKEN } from "@nexo/shared";
import { importPKCS8, SignJWT, type CryptoKey } from "jose";

export type TokenSigner = (requesterId: string) => Promise<string>;

// Signs the short-lived JWT the ticket service expects (stage 4 PRD, decision 8).
// Only the API holds the private key; a fresh token is signed for every attempt.
export function createServiceTokenSigner(privateKeyPem: string): TokenSigner {
  let key: Promise<CryptoKey> | undefined;

  return async (requesterId) => {
    key ??= importPKCS8(privateKeyPem, SERVICE_TOKEN.algorithm);
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: SERVICE_TOKEN.algorithm })
      .setIssuer(SERVICE_TOKEN.issuer)
      .setAudience(SERVICE_TOKEN.audience)
      .setSubject(requesterId)
      .setIssuedAt(now)
      .setExpirationTime(now + SERVICE_TOKEN.lifetimeSeconds)
      .setJti(crypto.randomUUID())
      .sign(await key);
  };
}

// The private key as `pnpm bootstrap` writes it to the env file: base64 of a PEM.
export function decodePem(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf8");
}
