import { SLA_BY_PRIORITY, TIME_ZONE, type DraftView } from "@nexo/shared";

// Minimal draft with "Confirmar" and "Cancelar" (stage 6 PRD, out of scope note): enough to
// use and test the flow. Stage 7 replaces it with the prototype's card.

export type DraftActions = {
  pendingDraftId: string | null;
  busy: boolean;
  error: string | null;
  decide: (draftId: string, action: "confirm" | "cancel") => void;
};

const TYPE = { INC: "Incidente", REQ: "Requisição" } as const;
const AFFECTED = {
  so_eu: "Somente você",
  equipe: "Sua equipe",
  empresa: "Toda a empresa",
} as const;

export function DraftBlock({ draft, actions }: { draft: DraftView; actions: DraftActions }) {
  const waiting = actions.pendingDraftId === draft.id;

  return (
    <div className="max-w-[600px] rounded-xl border border-rule bg-desk px-4 py-3 text-[13.5px] text-ink">
      <p className="text-[12.5px] text-ink-3">
        {heading(draft)} · Rascunho {draft.number}
      </p>
      <DraftFields draft={draft} />
      {draft.kind === "create" && draft.duplicates.length > 0 && (
        <p className="mt-2 text-[12.5px] text-warning-text">
          Você já tem chamados abertos nesta categoria:{" "}
          {draft.duplicates.map((d) => `${d.number} (${d.title})`).join(", ")}.
        </p>
      )}
      {waiting && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={actions.busy}
            onClick={() => actions.decide(draft.id, "confirm")}
            className="h-8 rounded-md bg-cta px-3 font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={actions.busy}
            onClick={() => actions.decide(draft.id, "cancel")}
            className="h-8 rounded-md px-3 font-semibold text-ink-2 hover:bg-paper disabled:opacity-50"
          >
            Cancelar
          </button>
          {actions.error && (
            <span role="alert" className="text-[12.5px] text-danger-text">
              {actions.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function heading(draft: DraftView) {
  if (draft.kind === "create") return "Novo chamado";
  if (draft.kind === "update") return `Informação nova para ${draft.ticketNumber}`;
  return `Reabrir ${draft.ticketNumber}`;
}

function DraftFields({ draft }: { draft: DraftView }) {
  if (draft.kind === "update") return <p className="mt-1">{draft.fields.message}</p>;
  if (draft.kind === "reopen") return <p className="mt-1">Motivo: {draft.fields.reason}</p>;
  const f = draft.fields;
  return (
    <>
      <p className="mt-1 text-[15px] font-semibold">{f.title}</p>
      <p className="mt-0.5 text-ink-2">{f.description}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <Field label="Tipo" value={TYPE[f.type]} />
        <Field label="Categoria" value={f.category} />
        <Field
          label="Prioridade"
          value={`${SLA_BY_PRIORITY[f.priority].label} · resposta até ${formatDue(f.dueAt)}`}
        />
        <Field label="Afetados" value={AFFECTED[f.impact]} />
      </dl>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDue(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
