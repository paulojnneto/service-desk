import { findPersonById, SERVICE_TOKEN } from "@nexo/shared";
import { createMiddleware } from "hono/factory";
import { jwtVerify, type CryptoKey } from "jose";
import type { TicketsEnv } from "../env-types";

// Only the API may call the service: it signs a short-lived JWT (ES256) for every call,
// with the requester as `sub`. The service holds only the public key, so it can check
// tokens but never create them (stage 4 PRD, decision 8).
export function serviceToken(publicKey: CryptoKey) {
  return createMiddleware<TicketsEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) return c.json({ error: "invalid_token" }, 401);

    let subject: string;
    try {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: [SERVICE_TOKEN.algorithm], // refuses "none", HS256 and any other algorithm
        issuer: SERVICE_TOKEN.issuer,
        audience: SERVICE_TOKEN.audience,
        clockTolerance: SERVICE_TOKEN.clockToleranceSeconds,
        maxTokenAge: SERVICE_TOKEN.lifetimeSeconds,
        requiredClaims: ["sub", "iat", "exp", "jti"],
      });
      // A token valid for longer than the agreed lifetime was not issued by our API.
      const lifetime = (payload.exp ?? 0) - (payload.iat ?? 0);
      if (lifetime > SERVICE_TOKEN.lifetimeSeconds) throw new Error("Token lifetime too long");
      subject = payload.sub as string;
    } catch {
      return c.json({ error: "invalid_token" }, 401);
    }

    if (!findPersonById(subject)) return c.json({ error: "unknown_requester" }, 401);
    // The requester comes only from the token; any requester header is ignored.
    c.set("requesterId", subject);
    await next();
  });
}
