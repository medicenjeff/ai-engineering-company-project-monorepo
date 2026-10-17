"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Opcional: registrar el error en un servicio de monitorización
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 sm:p-10">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-full bg-rose-100 text-2xl"
        >
          ⚠️
        </span>
        <h1 className="text-lg font-semibold text-zinc-900">
          No se pudieron cargar las candidaturas
        </h1>
        <p className="text-sm text-zinc-500">
          Ha ocurrido un error inesperado al obtener los datos del pipeline.
          Inténtalo de nuevo en unos momentos.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}