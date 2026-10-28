import { CircleAlert, LoaderCircle } from "lucide-react";

// The frame shared by the chat cards (Screens 2 and 3), with their loading and error states
// (stage 7 PRD, S-07.8).

export function CardShell({
  children,
  footer,
  label,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className="w-full max-w-[870px] overflow-hidden rounded-xl border border-rule bg-paper shadow-[0_1px_3px_#1B24310F]"
    >
      <div className="px-4 py-3.5 sm:px-5">{children}</div>
      {footer && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rule bg-desk px-2 py-2">
          {footer}
        </div>
      )}
    </section>
  );
}

// "Chamado · INC-20311" on the left, a status on the right.
export function CardHeader({
  kind,
  number,
  status,
}: {
  kind: string;
  number?: string;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]">
      <p className="flex items-center gap-1.5 text-ink-3">
        <span>{kind}</span>
        {number && (
          <>
            <span aria-hidden="true" className="text-rule">
              ·
            </span>
            <span>{number}</span>
          </>
        )}
      </p>
      {status}
    </div>
  );
}

export function StatusDot({
  dot,
  className,
  children,
}: {
  dot: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[14.5px] break-words text-ink">{children}</dd>
    </div>
  );
}

// Placeholder with the card's shape while a tool runs.
export function CardLoading({ label }: { label: string }) {
  return (
    <CardShell label={label}>
      <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
        <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> {label}
      </p>
      <div className="mt-3 animate-pulse space-y-2" aria-hidden="true">
        <div className="h-4 w-2/3 rounded bg-desk" />
        <div className="h-3 w-full rounded bg-desk" />
        <div className="h-3 w-1/2 rounded bg-desk" />
      </div>
    </CardShell>
  );
}

// What could not be done, instead of an empty card.
export function CardError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex w-full max-w-[600px] items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-[13.5px] text-danger-text"
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
