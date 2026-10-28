import { KeyRound, Lock, Mail, RotateCcwKey } from "lucide-react";
import { TopBar } from "../../components/top-bar";
import { useEmployee } from "../../lib/use-employee";

// "Meu perfil", from the prototype's profile frame.
export function ProfilePage() {
  const user = useEmployee();

  return (
    <>
      <title>Meu perfil · Nexo Assist</title>
      <TopBar here="Meu perfil" />
      <div className="flex-1 overflow-y-auto px-6 py-12">
        <div className="mx-auto flex max-w-[600px] flex-col gap-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-bold text-ink">Meu perfil</h1>
            <p className="text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>
          </div>

          <section className="rounded-2xl border border-rule bg-paper shadow-[0_1px_2px_#1B24310A]">
            <Row label="Nome">{user.name}</Row>
            <Row label="E-mail corporativo" note="Gerenciado pela TI">
              {user.email}
            </Row>
          </section>

          <section className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_1px_2px_#1B24310A]">
            <div className="flex items-center gap-4 px-6 py-5">
              <span className="flex size-10 items-center justify-center rounded-full bg-desk">
                <KeyRound className="size-[18px] text-ink-2" aria-hidden="true" />
              </span>
              <div className="flex flex-1 flex-col">
                <span className="text-[14.5px] font-semibold text-ink">Senha</span>
                <span className="text-[13.5px] text-ink-3">A mesma da rede Nexo</span>
              </div>
              {/* No real password flow behind it (stage 3 PRD, decision 4). */}
              <button
                type="button"
                disabled
                title="A redefinição é feita pela TI"
                className="flex items-center gap-2 rounded-lg border border-rule px-3.5 py-2 text-[13.5px] font-medium text-ink-2 disabled:cursor-not-allowed"
              >
                <RotateCcwKey className="size-[15px]" aria-hidden="true" /> Redefinir senha
              </button>
            </div>
            <p className="flex items-center gap-2 bg-desk px-6 py-3 text-[13px] text-ink-3">
              <Mail className="size-3.5 shrink-0" aria-hidden="true" />
              Para redefinir a senha da rede, ligue para a TI no ramal 4000.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-rule px-6 py-[18px] last:border-b-0">
      <span className="w-40 shrink-0 text-[13.5px] text-ink-3">{label}</span>
      <span className="flex-1 text-[14.5px] font-medium text-ink">{children}</span>
      {note && (
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
          <Lock className="size-[13px]" aria-hidden="true" /> {note}
        </span>
      )}
    </div>
  );
}
