import { LoaderCircle } from "lucide-react";

// Shown while a route asks the API who is signed in.
export function PageLoading() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status">
      <LoaderCircle className="size-5 animate-spin text-ink-3" aria-hidden="true" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
