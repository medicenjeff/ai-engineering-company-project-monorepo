import { Suspense } from "react";
import type { Metadata } from "next";
import { listRecords } from "@/lib/tracker-api";
import CandidatesTable from "./candidates-table";

export const metadata: Metadata = {
  title: "Candidaturas | Pipeline Tracker",
  description: "Todas las candidaturas del proceso de selección de Nexova",
};

export default async function CandidatesPage() {
  const { data, total } = await listRecords();

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
          Candidaturas
        </h1>
        <p className="text-sm text-zinc-500">
          {total} candidaturas registradas en el pipeline de Nexova
        </p>
      </header>

      {/* Suspense: permite prerender el envoltorio; el cliente con useSearchParams se renderiza al hidratar */}
      <Suspense fallback={null}>
        <CandidatesTable candidates={data} total={total} />
      </Suspense>
    </main>
  );
}
