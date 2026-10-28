import { RotateCcw } from "lucide-react";
import { NexoMark } from "./nexo-mark";

// Full-page error when a screen cannot load, usually because the API is down.
export function RouteError() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
      <NexoMark className="size-8" />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-bold text-ink">Serviço indisponível no momento</h1>
        <p className="text-[14.5px] text-ink-3">
          Não conseguimos falar com o service desk. Tente de novo em instantes.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-cta px-4 py-2 text-[13.5px] font-semibold text-white"
      >
        <RotateCcw className="size-4" /> Tentar de novo
      </button>
    </main>
  );
}
