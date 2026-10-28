import { NavLink } from "react-router";
import { MessageSquare, UserRound } from "lucide-react";

const LINKS = [
  { to: "/", label: "Atendimento", Icon: MessageSquare },
  { to: "/perfil", label: "Meu perfil", Icon: UserRound },
];

export function NavLinks() {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {LINKS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            `group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] ${
              isActive
                ? "active bg-primary-soft font-semibold text-primary-text"
                : "font-medium text-ink-2 hover:bg-desk"
            }`
          }
        >
          <Icon
            className="size-4 text-ink-3 group-[.active]:text-primary-text"
            aria-hidden="true"
          />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
