// The JWT the API signs for every call to the ticket service (stage 4 PRD, decision 8).
// The API holds the ES256 private key; the ticket service holds only the public key.
export const SERVICE_TOKEN = {
  algorithm: "ES256",
  issuer: "nexo-api",
  audience: "nexo-tickets",
  lifetimeSeconds: 60,
  clockToleranceSeconds: 5,
} as const;
