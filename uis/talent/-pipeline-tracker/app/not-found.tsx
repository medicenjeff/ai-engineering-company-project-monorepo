import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-full bg-amber-100 text-2xl"
        >
          🔍
        </span>
        <h1 className="text-lg font-semibold text-zinc-900">
          Candidatura no encontrada
        </h1>
        <p className="text-sm text-zinc-500">
          La candidatura que buscas no existe o ya no está disponible en el
          pipeline.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          <span aria-hidden>←</span> Volver a candidaturas
        </Link>
      </div>
    </main>
  );
}