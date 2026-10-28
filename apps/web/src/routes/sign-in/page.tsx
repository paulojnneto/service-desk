import { NexoMark } from "../../components/nexo-mark";
import { SignInForm } from "./sign-in-form";

// Screen 1 of the prototype: presentation panel on the left, form on the right.
export function SignInPage() {
  return (
    <div className="flex min-h-dvh">
      <title>Entrar · Nexo Assist</title>
      <Showcase />
      <section className="flex min-h-dvh flex-1 flex-col justify-between px-6 py-10 sm:px-14">
        <p className="flex justify-end gap-1.5 text-[13.5px] text-ink-3">
          Problema para entrar?
          <a href="tel:4000" className="font-semibold text-primary-text hover:underline">
            Ligue no ramal 4000
          </a>
        </p>
        <div className="flex justify-center py-10">
          <SignInForm />
        </div>
        <footer className="flex justify-between gap-4 text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </div>
  );
}

// Hidden below 1280 px, where the form takes the whole screen.
function Showcase() {
  return (
    <aside className="hidden w-[55%] max-w-[800px] shrink-0 flex-col justify-between bg-ink px-16 pt-10 pb-12 text-white xl:flex">
      <div className="flex items-center gap-2.5">
        <NexoMark className="size-6" color="#FFFFFF" />
        <span className="text-[17px] font-bold tracking-[-0.2px]">Nexo Assist</span>
      </div>

      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-[18px]">
          <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
          <h1 className="font-display text-[54px] leading-[1.04] tracking-[-1.2px]">
            Seu problema de TI, resolvido em uma conversa.
          </h1>
          <p className="max-w-[520px] text-base leading-[1.55] text-white/65">
            Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central
            de ajuda e chama um analista quando precisa.
          </p>
        </div>
        <ConversationPreview />
      </div>

      {/* Illustrative numbers, as in the prototype (stage 3 PRD, decision 3). */}
      <dl className="grid grid-cols-3 border-t border-white/10 pt-6">
        <Stat value="8 s" label="primeira resposta, em média" />
        <Stat value="72%" label="resolvidos sem fila" divider />
        <Stat value="6" label="analistas online agora" divider live />
      </dl>
    </aside>
  );
}

function ConversationPreview() {
  return (
    <div className="2xl:pl-24" aria-hidden="true">
      <div className="flex w-full max-w-[500px] flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/4 p-[18px]">
        <div className="flex justify-end">
          <p className="rounded-xl rounded-br-sm bg-paper px-3.5 py-[9px] text-[13.5px] text-ink">
            Meu notebook não conecta na VPN. Erro 809.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="flex gap-1.5 text-[12.5px]">
            <span className="font-semibold text-white/80">Nexo Assist</span>
            <span className="text-white/45">consultou seus chamados · criou um chamado</span>
          </p>
          <p className="max-w-[380px] rounded-xl rounded-tl-sm bg-white/8 px-3.5 py-2.5 text-[13.5px] leading-normal">
            Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
          </p>
          <p className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-[7px] text-[12.5px]">
            <span className="size-[7px] rounded-full bg-warning" />
            <span className="font-semibold text-ink">INC-20517</span>
            <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  divider,
  live,
}: {
  value: string;
  label: string;
  divider?: boolean;
  live?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${divider ? "border-l border-white/10 pl-6" : ""}`}>
      <dt className="order-2 text-[13.5px] text-white/55">{label}</dt>
      <dd className="order-1 flex items-center gap-2 font-display text-[34px] tracking-[-0.6px]">
        {value}
        {live && <span className="size-2 rounded-full bg-success" />}
      </dd>
    </div>
  );
}
