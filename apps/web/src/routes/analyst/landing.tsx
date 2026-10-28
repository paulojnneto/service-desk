import type { SessionUser } from "@nexo/shared";
import { Form, useLoaderData } from "react-router";

// Minimal page; the analyst landing layout arrives in a later commit.
export function AnalystLanding() {
  const { user } = useLoaderData() as { user: SessionUser };
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-bold text-ink">Olá, {user.firstName}.</h1>
      <Form method="post" action="/sign-out">
        <button type="submit">Sair</button>
      </Form>
    </main>
  );
}
