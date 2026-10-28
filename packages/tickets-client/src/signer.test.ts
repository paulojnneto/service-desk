import { SERVICE_TOKEN } from "@nexo/shared";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { createServiceTokenSigner } from "./signer";

describe("service token signer", () => {
  it("signs an ES256 token with the requester, issuer, audience, jti and a 60 s lifetime", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const sign = createServiceTokenSigner(await exportPKCS8(privateKey));

    const token = await sign("ana.souza");
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
      issuer: SERVICE_TOKEN.issuer,
      audience: SERVICE_TOKEN.audience,
    });

    expect(protectedHeader.alg).toBe("ES256");
    expect(payload.sub).toBe("ana.souza");
    expect(payload.jti).toEqual(expect.any(String));
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(60);
  });

  it("signs a different token every time", async () => {
    const { privateKey } = await generateKeyPair("ES256", { extractable: true });
    const sign = createServiceTokenSigner(await exportPKCS8(privateKey));

    expect(await sign("ana.souza")).not.toBe(await sign("ana.souza"));
  });
});
