import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { articles } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { articleSearchText, toSearchQuery } from "../search-text";
import { signTestToken, testKeys } from "../test-tokens";

let app: ReturnType<typeof createApp>;
let token: string;

const sample = [
  {
    id: "vpn-erro-809",
    title: "VPN com erro 809",
    body: "Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
  },
  {
    id: "horario-service-desk",
    title: "Horário do service desk",
    body: "De segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
  },
  {
    id: "senha-rede",
    title: "Redefinir a senha da rede",
    body: "A senha da rede é redefinida pela TI no ramal 4000.",
  },
];

beforeAll(async () => {
  const db = await createTestDb();
  await db.insert(articles).values(sample.map((a) => ({ ...a, searchText: articleSearchText(a) })));
  const keys = await testKeys();
  app = createApp({ db, tokenPublicKey: keys.publicKey });
  token = await signTestToken(keys.privateKey, "ana.souza");
});

async function search(q: string) {
  const res = await app.request(`/articles/search?q=${encodeURIComponent(q)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return { res, json: (await res.json()) as { articles: { id: string }[]; error?: string } };
}

describe("help center search", () => {
  it("finds the VPN article for 'VPN 809'", async () => {
    const { json } = await search("VPN 809");
    expect(json.articles[0]?.id).toBe("vpn-erro-809");
  });

  it("matches without accents: 'horario' finds 'Horário'", async () => {
    const { json } = await search("qual o horario de atendimento?");
    expect(json.articles[0]?.id).toBe("horario-service-desk");
  });

  it("keeps long questions useful by matching any meaningful word", async () => {
    const { json } = await search(
      "Meu notebook não conecta na VPN desde ontem, aparece o erro 809",
    );
    expect(json.articles[0]?.id).toBe("vpn-erro-809");
  });

  it("returns nothing when no article matches", async () => {
    const { json } = await search("impressora");
    expect(json.articles).toEqual([]);
  });

  it("refuses an empty question", async () => {
    const { res } = await search("   ");
    expect(res.status).toBe(400);
  });
});

describe("toSearchQuery", () => {
  it("drops accents, punctuation, stop words and repeats", () => {
    expect(toSearchQuery("Não consigo acessar o SAP, o SAP!")).toBe("consigo | acessar | sap");
  });
});
