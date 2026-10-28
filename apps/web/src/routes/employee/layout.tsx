import { Form, Outlet } from "react-router";
import { LogOut } from "lucide-react";
import { NexoMark } from "../../components/nexo-mark";
import { useEmployee } from "../../lib/use-employee";
import { NavLinks } from "./nav-links";

// Shell of the employee screens (Screens 2 and 3 and the profile): sidebar and main area.
// On narrow screens the sidebar becomes a rail of icons, so the chat keeps the width
// (stage 7 PRD, S-07.14).
export function EmployeeLayout() {
  const user = useEmployee();

  return (
    <div className="flex h-dvh">
      <aside className="flex w-14 shrink-0 flex-col border-r border-rule px-2 pt-5 pb-3.5 md:w-[232px] md:px-3.5">
        <div className="flex items-center gap-2.5 px-2">
          <NexoMark className="size-5" />
          <span className="sr-only text-base font-bold tracking-[-0.2px] text-ink md:not-sr-only">
            Nexo Assist
          </span>
        </div>
        <div className="h-[22px]" />
        <NavLinks />
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 border-t border-rule pt-3.5 pb-1 md:px-2">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
            {user.initials}
          </span>
          <div className="hidden min-w-0 flex-col gap-px md:flex">
            <span className="truncate text-[13.5px] font-semibold text-ink">{user.name}</span>
            <span className="truncate text-[11.5px] text-ink-3">{user.email}</span>
          </div>
        </div>
        <Form method="post" action="/sign-out">
          <button
            type="submit"
            className="flex h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk"
          >
            <LogOut className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span className="sr-only md:not-sr-only">Sair</span>
          </button>
        </Form>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
