import type { Metadata } from "next";
import CandidateDetail from "./candidate-detail";

// Ruta dinámica: el detalle se obtiene en el cliente con estados explícitos
// (carga / éxito / error), manteniendo la navegación sin recargas completas.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Detalle de candidatura",
    description: "Detalle de candidatura del proceso de selección de Nexova",
  };
}

interface CandidateDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CandidateDetailPage({
  params,
}: CandidateDetailPageProps) {
  const { id } = await params;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6 sm:p-10">
      <CandidateDetail candidateId={id} />
    </main>
  );
}