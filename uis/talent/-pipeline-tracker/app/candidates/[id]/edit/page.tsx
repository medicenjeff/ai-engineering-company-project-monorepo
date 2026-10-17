import type { Metadata } from "next";
import EditCandidate from "./edit-candidate";

export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Editar candidatura",
    description: "Edita los datos de una candidatura del pipeline de Nexova",
  };
}

interface EditCandidatePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCandidatePage({
  params,
}: EditCandidatePageProps) {
  const { id } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6 sm:p-10">
      <EditCandidate candidateId={id} />
    </main>
  );
}