import type { Metadata } from "next";
import Link from "next/link";
import CandidateForm from "../candidate-form";

export const metadata: Metadata = {
  title: "Nueva candidatura",
  description: "Registra una nueva candidatura en el pipeline de Nexova",
};

export default function NewCandidatePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-10">
      <nav aria-label="Volver">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <span aria-hidden>←</span> Volver a candidaturas
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Nueva candidatura
        </h1>
        <p className="text-sm text-zinc-500">
          Registra a un nuevo candidato en el pipeline de Nexova. Los campos
          marcados con <span className="text-rose-500">*</span> son obligatorios.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
        <CandidateForm mode="create" />
      </section>
    </main>
  );
}