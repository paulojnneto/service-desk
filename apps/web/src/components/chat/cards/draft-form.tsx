import {
  Category,
  EditDraftInput,
  priorityFor,
  type DraftView,
  type Impact,
  type Urgency,
} from "@nexo/shared";
import { useState } from "react";
import { priorityLabel } from "../../../lib/format";
import { AFFECTED_LABEL, TYPE_LABEL, URGENCY_LABEL } from "./draft-labels";

// "Editar" on a draft (stage 7 PRD, S-07.6 and decision 5). The priority is not a field: it
// follows who is affected and the urgency, and the server recalculates it on save. Esc closes
// the form without saving (S-07.9).

export function DraftForm({
  draft,
  saving,
  error,
  onSave,
  onClose,
}: {
  draft: DraftView;
  saving: boolean;
  error: string | null;
  onSave: (input: EditDraftInput) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(draft));
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const set = (name: string) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: event.target.value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = EditDraftInput.safeParse(inputFrom(draft, values));
    if (!parsed.success) {
      setInvalid(new Set(parsed.error.issues.map((issue) => String(issue.path.at(-1)))));
      return;
    }
    setInvalid(new Set());
    onSave(parsed.data);
  }

  const field = (name: string) => ({
    id: `${draft.id}-${name}`,
    value: values[name] ?? "",
    onChange: set(name),
    "aria-invalid": invalid.has(name) || undefined,
    className: `w-full rounded-md border bg-paper px-2.5 py-1.5 text-[14px] text-ink outline-none focus:border-cta ${
      invalid.has(name) ? "border-danger" : "border-rule"
    }`,
  });

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      className="mt-3 space-y-3 border-t border-rule pt-3"
      aria-label={`Editar rascunho ${draft.number}`}
    >
      {draft.kind === "create" ? (
        <>
          <Labeled
            label="Título"
            htmlFor={`${draft.id}-title`}
            hint={invalid.has("title") ? "De 3 a 120 caracteres." : undefined}
          >
            <input {...field("title")} autoFocus maxLength={120} />
          </Labeled>
          <Labeled
            label="Descrição"
            htmlFor={`${draft.id}-description`}
            hint={invalid.has("description") ? "De 10 a 2.000 caracteres." : undefined}
          >
            <textarea {...field("description")} rows={3} maxLength={2000} />
          </Labeled>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labeled label="Tipo" htmlFor={`${draft.id}-type`}>
              <select {...field("type")}>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Categoria" htmlFor={`${draft.id}-category`}>
              <select {...field("category")}>
                {Category.options.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Quem está sendo afetado" htmlFor={`${draft.id}-impact`}>
              <select {...field("impact")}>
                {Object.entries(AFFECTED_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Urgência" htmlFor={`${draft.id}-urgency`}>
              <select {...field("urgency")}>
                {Object.entries(URGENCY_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <p className="text-[13px] text-ink-3">
            Prioridade calculada:{" "}
            <span className="font-medium text-ink">
              {priorityLabel(priorityFor(values.impact as Impact, values.urgency as Urgency))}
            </span>
          </p>
        </>
      ) : (
        <Labeled
          label={draft.kind === "update" ? "Informação nova" : "Motivo da reabertura"}
          htmlFor={`${draft.id}-text`}
          hint={invalid.has("message") || invalid.has("reason") ? "Escreva algo." : undefined}
        >
          <textarea {...field("text")} autoFocus rows={3} maxLength={2000} />
        </Labeled>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="h-8 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="h-8 rounded-md px-3 text-[13.5px] font-medium text-ink-2 hover:bg-desk disabled:opacity-50"
        >
          Descartar alterações
        </button>
        {error && (
          <span role="alert" className="text-[12.5px] text-danger-text">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function Labeled({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[12.5px] text-ink-3">
        {label}
      </label>
      {children}
      {hint && <p className="text-[12.5px] text-danger-text">{hint}</p>}
    </div>
  );
}

function initialValues(draft: DraftView): Record<string, string> {
  if (draft.kind === "update") return { text: draft.fields.message };
  if (draft.kind === "reopen") return { text: draft.fields.reason };
  const { type, title, description, category, impact, urgency } = draft.fields;
  return { type, title, description, category, impact, urgency };
}

function inputFrom(draft: DraftView, values: Record<string, string>): unknown {
  if (draft.kind === "update") return { kind: "update", fields: { message: values.text } };
  if (draft.kind === "reopen") return { kind: "reopen", fields: { reason: values.text } };
  const { type, title, description, category, impact, urgency } = values;
  return { kind: "create", fields: { type, title, description, category, impact, urgency } };
}
