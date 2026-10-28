import { Form, useActionData, useNavigation } from "react-router";
import type { SignInActionData } from "./action";

// Minimal form; the Screen 1 layout arrives in the next commit.
export function SignInPage() {
  const result = useActionData() as SignInActionData | undefined;
  const pending = useNavigation().state === "submitting";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Form method="post" className="flex w-full max-w-[380px] flex-col gap-3">
        <h1 className="text-2xl font-bold text-ink">Entrar</h1>
        <input name="email" type="email" defaultValue={result?.email} placeholder="E-mail" />
        <input name="password" type="password" placeholder="Senha" />
        <label>
          <input type="checkbox" name="remember" defaultChecked /> Manter conectado
        </label>
        {result?.error && <p role="alert">{result.error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </Form>
    </main>
  );
}
