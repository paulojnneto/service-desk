import type { SessionUser } from "@nexo/shared";
import { Form, useLoaderData } from "react-router";
import { LogOut } from "lucide-react";
import { NexoMark } from "../../components/nexo-mark";

// Where analysts land after signing in. The console (Screens 4 and 5) comes in Stage 9.
export function AnalystLanding() {
  const { user } = useLoaderData() as { user: SessionUser };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-desk px-6 text-center">
      <title>Console · Nexo Assist</title>
      <NexoMark className="size-8" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold text-ink">Olá, {user.firstName}.</h1>
        <p className="text-[14.5px] text-ink-3">
          O console do analista está em construção. Em breve, as conversas que precisam de você
          aparecem aqui.
        </p>
      </div>
      <Form method="post" action="/sign-out">
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg border border-rule bg-paper px-3.5 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-desk"
        >
          <LogOut className="size-4 text-ink-3" aria-hidden="true" /> Sair
        </button>
      </Form>
    </main>
  );
}
