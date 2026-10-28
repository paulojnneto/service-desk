import { ChevronRight } from "lucide-react";

// Top bar of the employee screens: breadcrumb and an optional status on the right.
export function TopBar({ here, children }: { here: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule px-8">
      <nav aria-label="Trilha" className="flex flex-1 items-center gap-2 text-[13.5px]">
        <span className="text-ink-3">Service desk de TI</span>
        <ChevronRight className="size-3.5 text-ink-3" aria-hidden="true" />
        <span className="font-semibold text-ink">{here}</span>
      </nav>
      {children}
    </header>
  );
}

export function AssistantOnline() {
  return (
    <span className="flex items-center gap-[7px] rounded-full bg-success-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-success-text">
      <span className="size-[7px] rounded-full bg-success" />
      Assistente online
    </span>
  );
}
