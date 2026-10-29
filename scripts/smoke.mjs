// pnpm smoke [url] — checks a running stack (stage 12 tech spec, S-12.9), by default the
// Docker Compose one on http://localhost:8080. Node's fetch only, so CI needs no install.
// It starts a new conversation for Ana (as "Nova conversa" does; the old one stays stored)
// and sends one message: with a real model, that is one agent turn.
const base = (process.argv[2] ?? "http://localhost:8080").replace(/\/$/, "");
const WAIT_MS = 120_000;

let failed = false;
async function check(name, run) {
  if (failed) return;
  try {
    const detail = await run();
    console.log(`✓ ${name}${detail ? ` · ${detail}` : ""}`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${name} · ${error.message}`);
    process.exitCode = 1;
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(email) {
  const res = await fetch(`${base}/api/auth/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "smoke" }),
  });
  expect(res.ok, `sign-in answered ${res.status}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  expect(cookie, "no session cookie");
  return cookie;
}

await check(`health of ${base}`, async () => {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // Not up yet: the first build and the migrations take a while.
    }
    expect(Date.now() < until, `no answer in ${WAIT_MS / 1000} s`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
});

await check("the screens, with the content security policy", async () => {
  const res = await fetch(`${base}/console`);
  expect(res.ok, `answered ${res.status}`);
  expect((await res.text()).includes('<div id="root"'), "not the web app's page");
  const policy = res.headers.get("content-security-policy") ?? "";
  expect(policy.includes("default-src 'self'"), "no content security policy");
});

let ana;
await check("Ana signs in", async () => {
  ana = await signIn("ana.souza@nexo.com.br");
});

await check("Ana starts a new conversation", async () => {
  const res = await fetch(`${base}/api/conversations/current/close`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ana },
    body: "{}",
  });
  expect(res.ok, `answered ${res.status}`);
});

await check("one agent turn", async () => {
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ana },
    body: JSON.stringify({
      message: {
        id: `smoke-${Date.now()}`,
        parts: [{ type: "text", text: "Meu Outlook não abre" }],
      },
    }),
  });
  expect(res.ok, `answered ${res.status}`);
  const chunks = (await res.text())
    .split("\n")
    .filter((line) => line.startsWith("data: {"))
    .map((line) => JSON.parse(line.slice("data: ".length)));
  const error = chunks.find((c) => c.type === "error");
  expect(!error, `the stream failed: ${error?.errorText}`);
  const text = chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => c.delta)
    .join("");
  expect(text.trim(), "no text in the reply");
  const decision = chunks.find((c) => c.type === "message-metadata" && c.messageMetadata?.decision)
    ?.messageMetadata.decision;
  expect(decision, "no decision record");
  return `${decision.intent} → ${decision.action}`;
});

await check("Rafael signs in and opens the console", async () => {
  const rafael = await signIn("rafael.lima@nexo.com.br");
  const res = await fetch(`${base}/api/analyst/conversations?filter=todas`, {
    headers: { cookie: rafael },
  });
  expect(res.ok, `answered ${res.status}`);
  const { conversations } = await res.json();
  expect(conversations.length > 0, "no conversations");
  return `${conversations.length} conversations`;
});

if (!failed) console.log("Smoke test passed.");
