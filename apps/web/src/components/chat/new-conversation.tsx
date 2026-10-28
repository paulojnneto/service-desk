import { useRef } from "react";
import { Form, useNavigation } from "react-router";
import { SquarePen } from "lucide-react";

// "Nova conversa" (stage 5 PRD, decision 2): closes the current conversation after a
// confirmation. Also offered by the message shown at the limit.
export function NewConversation({ variant = "top-bar" }: { variant?: "top-bar" | "inline" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigation = useNavigation();
  const closing = navigation.state !== "idle" && navigation.formMethod === "POST";

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className={
          variant === "top-bar"
            ? "flex h-8 items-center gap-1.5 rounded-lg border border-rule px-2.5 text-[13px] font-semibold text-ink-2 hover:bg-desk"
            : "flex items-center gap-1.5 font-semibold underline"
        }
      >
        {variant === "top-bar" && <SquarePen className="size-3.5" aria-hidden="true" />}
        Nova conversa
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="new-conversation-title"
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-xl border border-rule bg-paper p-6 text-ink shadow-xl backdrop:bg-ink/30"
      >
        <h2 id="new-conversation-title" className="text-[16px] font-bold">
          Começar uma nova conversa?
        </h2>
        <p className="mt-2 text-[14px] leading-[1.5] text-ink-3">
          A conversa atual será encerrada e não aparecerá mais aqui. Seus chamados continuam abertos
          normalmente.
        </p>
        <Form
          method="post"
          action="/?index"
          onSubmit={() => dialog.current?.close()}
          className="mt-5 flex justify-end gap-2"
        >
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="h-9 rounded-lg px-3 text-[13.5px] font-semibold text-ink-2 hover:bg-desk"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={closing}
            className="h-9 rounded-lg bg-cta px-3 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Começar nova conversa
          </button>
        </Form>
      </dialog>
    </>
  );
}
