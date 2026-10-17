"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getRecord, TrackerApiError } from "@/lib/tracker-api";
import type { Candidate } from "@/lib/tracker-types";
import CandidateForm from "../../candidate-form";

interface EditCandidateProps {
  candidateId: string;
}

export default function EditCandidate({ candidateId }: EditCandidateProps) {
  // Tres estados de obtención de datos (GET /records/:id):
  // "loading" → "success" | "error" | "not_found".
  const [phase, setPhase] = useState<
    "loading" | "success" | "error" | "not_found"
  >("loading");
  const [candidate, setCandidate] = useState<Candidate | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPhase("loading");
      try {
        const record = await getRecord(candidateId);
        if (cancelled) return;
        setCandidate(record);
        setPhase("success");
      } catch (error) {
        if (cancelled) return;
        setPhase(
          error instanceof TrackerApiError && error.status === 404
            ? "not_found"
            : "error"
        );
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  // Estado de carga
  if (phase === "loading") {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <nav aria-label="Volver">
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
        </nav>
        <header className="flex flex-col gap-2">
          <div className="h-8 w-56 animate-pulse rounded-md bg-zinc-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-zinc-100" />
        </header>
        <section className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={i === 0 || i === 3 || i === 5 ? "sm:col-span-2" : ""}
              >
                <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
                <div className="mt-2 h-9 w-full animate-pulse rounded-md bg-zinc-100" />
              </div>
            ))}
          </div>
          <div className="mt-4 h-9 w-44 animate-pulse rounded-md bg-zinc-100" />
        </section>
      </div>
    );
  }

  // Estado de error (404 o conexión)
  if (phase === "error" || phase === "not_found" || !candidate) {
    const notFound = phase === "not_found";
    return (
      <div className="flex flex-col gap-6">
        <nav aria-label="Volver">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            <span aria-hidden>←</span> Volver a candidaturas
          </Link>
        </nav>
        <section className="flex flex-col items-center gap-3 rounded-xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <span
            aria-hidden
            className={`grid size-12 place-items-center rounded-full text-2xl ${
              notFound ? "bg-zinc-100" : "bg-rose-100"
            }`}
          >
            {notFound ? "🔍" : "⚠️"}
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">
            {notFound
              ? "Candidatura no encontrada"
              : "No se pudo cargar la candidatura"}
          </h2>
          <p className="max-w-md text-sm text-zinc-500">
            {notFound
              ? "Esta candidatura no existe o ya no está disponible."
              : "Ha ocurrido un error al obtener los datos desde la API. Inténtalo de nuevo en unos momentos."}
          </p>
          {notFound ? (
            <Link
              href="/"
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Ver candidaturas
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Reintentar
            </button>
          )}
        </section>
      </div>
    );
  }

  // Estado de éxito: formulario precargado
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Volver">
        <Link
          href={`/candidates/${candidate.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <span aria-hidden>←</span> Volver a la candidatura
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Editar candidatura
        </h1>
        <p className="text-sm text-zinc-500">
          Modifica los datos de{" "}
          <span className="font-medium text-zinc-700">
            {candidate.full_name}
          </span>
          . Los campos marcados con <span className="text-rose-500">*</span>{" "}
          son obligatorios.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <CandidateForm mode="edit" candidate={candidate} />
      </section>
    </div>
  );
}