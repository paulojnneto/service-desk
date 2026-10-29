import type { DraftView, EditDraftInput } from "@nexo/shared";
import { Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { formatDue, PRIORITY_DOT, priorityLabel } from "../../../lib/format";
import { CardHeader, CardShell, Field, StatusDot } from "./card-shell";
import { DraftForm } from "./draft-form";
import { AFFECTED_LABEL, CONFIRM_SHORTCUT, TYPE_LABEL } from "./draft-labels";

// Draft card (prototype, Screen 2; stage 7 PRD, S-07.5 to S-07.7). It always shows the draft's
// current state, which the chat keeps from the server, so a reload never offers "Confirmar"
// on a draft that was already created, cancelled or replaced.

export type DraftActions = {
  // The draft as it is now; the tool part only has it as it was prepared.
  current: (draft: DraftView) => DraftView;
  busyId: string | null;
  error: { id: string; message: string } | null;
  disabled: boolean;
  confirm: (id: string) => void;
  cancel: (id: string) => void;
  // Resolves to true when saved.
  save: (id: string, input: EditDraftInput) => Promise<boolean>;
  // The analyst console shows drafts without their buttons (stage 9 tech spec).
  readOnly?: boolean;
};

export function DraftCard({ snapshot, actions }: { snapshot: DraftView; actions: DraftActions }) {
  const draft = actions.current(snapshot);
  const [editing, setEditing] = useState(false);
  const busy = actions.busyId === draft.id;
  const error = actions.error?.id === draft.id ? actions.error.message : null;
  const waiting = draft.status === "pending";

  const footer = waiting && !editing && !actions.readOnly && (
    <>
      <button
        type="button"
        onClick={() => actions.confirm(draft.id)}
        disabled={busy || actions.disabled}
        className="flex h-9 items-center gap-2 rounded-md bg-cta px-3.5 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
      >
        {busy && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
        Confirmar
        <kbd className="rounded bg-white/20 px-1.5 py-px font-sans text-[11px] font-medium">
          {CONFIRM_SHORTCUT}
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setEditing(true)}
        disabled={busy || actions.disabled}
        className="h-9 rounded-md border border-rule bg-paper px-3.5 text-[14px] font-medium text-ink hover:border-ink-3/40 disabled:opacity-50"
      >
        Editar
      </button>
      <button
        type="button"
        onClick={() => actions.cancel(draft.id)}
        disabled={busy || actions.disabled}
        className="h-9 rounded-md px-3.5 text-[14px] font-medium text-ink-2 hover:bg-paper disabled:opacity-50"
      >
        Cancelar
      </button>
      {error && (
        <span role="alert" className="px-1 text-[12.5px] text-danger-text">
          {error}
        </span>
      )}
    </>
  );

  return (
    <CardShell label={`Rascunho ${draft.number}`} footer={footer || undefined}>
      <CardHeader
        kind={kindLabel(draft)}
        number={`Rascunho ${draft.number}`}
        status={<DraftStatusLabel draft={draft} busy={busy} />}
      />
      {editing ? (
        <DraftForm
          draft={draft}
          saving={busy}
          error={error}
          onClose={() => setEditing(false)}
          onSave={async (input) => {
            if (await actions.save(draft.id, input)) setEditing(false);
          }}
        />
      ) : (
        <DraftBody draft={draft} />
      )}
    </CardShell>
  );
}

function kindLabel(draft: DraftView): string {
  if (draft.kind === "create") return `Novo chamado · ${TYPE_LABEL[draft.fields.type]}`;
  if (draft.kind === "update") return `Informação nova · ${draft.ticketNumber}`;
  return `Reabertura · ${draft.ticketNumber}`;
}

function DraftStatusLabel({ draft, busy }: { draft: DraftView; busy: boolean }) {
  if (busy || draft.status === "confirming") {
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> Registrando…
      </span>
    );
  }
  if (draft.status === "confirmed") {
    const done = { create: "Criado", update: "Atualizado", reopen: "Reaberto" }[draft.kind];
    return (
      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-success-text">
        <Check className="size-3.5" aria-hidden="true" /> {done} · {draft.resultTicket}
      </span>
    );
  }
  if (draft.status === "cancelled") {
    return <span className="text-[12.5px] text-ink-3">Cancelado</span>;
  }
  if (draft.status === "superseded") {
    return <span className="text-[12.5px] text-ink-3">Substituído por outro rascunho</span>;
  }
  return (
    <StatusDot dot="bg-warning" className="text-[12.5px] text-warning-text">
      Aguardando confirmação
    </StatusDot>
  );
}

function DraftBody({ draft }: { draft: DraftView }) {
  const faded = draft.status === "cancelled" || draft.status === "superseded";
  if (draft.kind !== "create") {
    return (
      <p className={`mt-1.5 text-[14.5px] text-ink ${faded ? "opacity-60" : ""}`}>
        {draft.kind === "update" ? draft.fields.message : `Motivo: ${draft.fields.reason}`}
      </p>
    );
  }
  const f = draft.fields;
  return (
    <div className={faded ? "opacity-60" : undefined}>
      <h3 className="mt-1.5 text-[17px] leading-snug font-semibold text-ink">{f.title}</h3>
      <p className="mt-1 text-[14px] leading-normal text-ink-2">{f.description}</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-rule pt-3 sm:grid-cols-3">
        <Field label="Categoria">{f.category}</Field>
        <Field label="Prioridade">
          <StatusDot dot={PRIORITY_DOT[f.priority]}>
            {priorityLabel(f.priority)}
            <span className="text-[13px] text-ink-3">· resposta até {formatDue(f.dueAt)}</span>
          </StatusDot>
        </Field>
        <Field label="Afetados">{AFFECTED_LABEL[f.impact]}</Field>
      </dl>
      {draft.duplicates.length > 0 && (
        <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
          Você já tem chamados abertos em {f.category}:{" "}
          {draft.duplicates.map((d) => `${d.number} (${d.title})`).join(", ")}. Confira se não é o
          mesmo problema antes de confirmar.
        </p>
      )}
    </div>
  );
}
