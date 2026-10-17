"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  stageLabel,
  statusLabel,
  formatDate,
  STATUS_LABELS,
  STAGE_LABELS,
} from "@/lib/tracker-types";
import type {
  Candidate,
  CandidateNote,
  CandidateStatus,
  CandidateStage,
} from "@/lib/tracker-types";
import {
  getRecord,
  listNotes,
  updateRecord,
  createNote,
  deleteNote,
  TrackerApiError,
} from "@/lib/tracker-api";

interface CandidateDetailProps {
  candidateId: string;
}

const STATUS_KEYS = Object.keys(STATUS_LABELS) as CandidateStatus[];
const STAGE_KEYS = Object.keys(STAGE_LABELS) as CandidateStage[];

const buttonPrimary =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";
const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";
const badgeStatus: Record<CandidateStatus, string> = {
  received: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  discarded: "bg-rose-100 text-rose-800",
};
const badgeStage =
  "bg-white text-zinc-900 ring-1 ring-inset ring-zinc-300";

function DetailRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-zinc-100 py-3 last:border-b-0">
      <dt className="text-sm font-medium text-zinc-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-zinc-900">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-zinc-900"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export default function CandidateDetail({ candidateId }: CandidateDetailProps) {
  const router = useRouter();
  // Tres estados de carga de datos (GET /records/:id + GET notes):
  // "loading" → "success" | "error" | "not_found". Se obtiene todo en el cliente
  // con async/await, sin recarga completa de página.
  const [phase, setPhase] = useState<
    "loading" | "success" | "error" | "not_found"
  >("loading");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [status, setStatus] = useState<CandidateStatus>("received");
  const [stage, setStage] = useState<CandidateStage>("pending");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [newNote, setNewNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Obtención inicial de datos (GET /records/:id y GET /records/:id/notes).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setPhase("loading");
      try {
        const [record, notesResponse] = await Promise.all([
          getRecord(candidateId),
          listNotes(candidateId),
        ]);
        if (cancelled) return;
        setCandidate(record);
        setNotes(notesResponse.data);
        setStatus(record.status);
        setStage(record.stage);
        setPhase("success");
      } catch (error) {
        if (cancelled) return;
        // Un 404 significa candidatura inexistente (URL mal escrita o borrada)
        setPhase(error instanceof TrackerApiError && error.status === 404 ? "not_found" : "error");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  const id = candidateId;

  // Actualiza estado mediante PATCH /records/:id
  const changeStatus = (next: CandidateStatus) => {
    const prev = status;
    setFeedback(null);
    setStatus(next); // optimista y reversible
    startTransition(async () => {
      try {
        const updated = await updateRecord(id, { status: next });
        setStatus(updated.status);
        setFeedback({ tone: "success", text: "Estado actualizado correctamente." });
        router.refresh(); // sincroniza el listado (server) sin recarga completa
      } catch {
        setStatus(prev);
        setFeedback({
          tone: "error",
          text: "No se pudo actualizar el estado. Inténtalo de nuevo.",
        });
      }
    });
  };

  // Actualiza etapa mediante PATCH /records/:id
  const changeStage = (next: CandidateStage) => {
    const prev = stage;
    setFeedback(null);
    setStage(next); // optimista y reversible
    startTransition(async () => {
      try {
        const updated = await updateRecord(id, { stage: next });
        setStage(updated.stage);
        setFeedback({ tone: "success", text: "Etapa actualizada correctamente." });
        router.refresh(); // sincroniza el listado (server) sin recarga completa
      } catch {
        setStage(prev);
        setFeedback({
          tone: "error",
          text: "No se pudo actualizar la etapa. Inténtalo de nuevo.",
        });
      }
    });
  };

  // Añade una nota mediante POST /records/:id/notes
  const handleAddNote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = newNote.trim();
    if (!content) return;
    setIsSavingNote(true);
    setFeedback(null);
    try {
      const created = await createNote(id, content);
      setNotes((prev) => [created, ...prev]);
      setNewNote("");
      setFeedback({ tone: "success", text: "Nota añadida correctamente." });
      router.refresh(); // sincroniza el contador de notas (server)
    } catch {
      setFeedback({
        tone: "error",
        text: "No se pudo añadir la nota. Inténtalo de nuevo.",
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  // Elimina una nota mediante DELETE /records/:id/notes/:note_id
  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.")) {
      return;
    }
    setFeedback(null);
    try {
      await deleteNote(id, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      setFeedback({ tone: "success", text: "Nota eliminada." });
      router.refresh(); // sincroniza el contador de notas (server)
    } catch {
      setFeedback({
        tone: "error",
        text: "No se pudo eliminar la nota. Inténtalo de nuevo.",
      });
    }
  };

  const sortedNotes = [...notes].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Estado de carga inicial (GET en curso)
  if (phase === "loading") {
    return (
      <div className="flex flex-col gap-8" role="status" aria-live="polite">
        <nav aria-label="Volver al listado">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
          >
            <span aria-hidden>←</span> Volver a candidaturas
          </Link>
        </nav>
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="h-6 w-44 animate-pulse rounded-full bg-zinc-200" />
          <div className="h-9 w-72 animate-pulse rounded-md bg-zinc-200" />
          <div className="h-5 w-56 animate-pulse rounded-md bg-zinc-100" />
        </div>
        <section className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
          <div className="mt-4 h-9 w-full animate-pulse rounded-md bg-zinc-100" />
          <div className="mt-3 h-9 w-2/3 animate-pulse rounded-md bg-zinc-100" />
        </section>
      </div>
    );
  }

  // Estado de error en la obtención de datos
  if (phase === "error" || !candidate) {
    return (
      <div className="flex flex-col gap-8">
        <nav aria-label="Volver al listado">
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
            className="grid size-12 place-items-center rounded-full bg-rose-100 text-2xl"
          >
            ⚠️
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">
            No se pudo cargar la candidatura
          </h2>
          <p className="max-w-md text-sm text-zinc-500">
            Ha ocurrido un error al obtener los datos desde la API. Inténtalo de
            nuevo en unos momentos.
          </p>
          <button
            type="button"
            onClick={async () => {
              window.location.reload();
            }}
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Reintentar
          </button>
        </section>
      </div>
    );
  }

  // Estado: candidatura inexistente (404)
  if (phase === "not_found") {
    return (
      <div className="flex flex-col gap-8">
        <nav aria-label="Volver al listado">
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
            className="grid size-12 place-items-center rounded-full bg-zinc-100 text-2xl"
          >
            🔍
          </span>
          <h2 className="text-lg font-semibold text-zinc-900">
            Candidatura no encontrada
          </h2>
          <p className="max-w-md text-sm text-zinc-500">
            Esta candidatura no existe o ya no está disponible. Vuelve al
            listado para ver las candidaturas activas.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Ver candidaturas
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Volver al listado">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
        >
          <span aria-hidden>←</span> Volver a candidaturas
        </Link>
      </nav>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeStatus[status]}`}
          >
            {statusLabel(status)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeStage}`}
          >
            {stageLabel(stage)}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
              {candidate.full_name}
            </h1>
            <p className="text-base text-zinc-500">
              Candidatura a{" "}
              <span className="font-medium text-zinc-800">
                {candidate.position}
              </span>
            </p>
          </div>
          <Link
            href={`/candidates/${id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50"
          >
            <span aria-hidden>✎</span> Editar
          </Link>
        </div>
      </header>

      {/* Actualizar estado y etapa (PATCH /records/:id) */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <h2 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Avanzar en el proceso
        </h2>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Estado</span>
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as CandidateStatus)}
              disabled={isPending}
              className={selectClass}
            >
              {STATUS_KEYS.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-zinc-700">Etapa</span>
            <select
              value={stage}
              onChange={(e) => changeStage(e.target.value as CandidateStage)}
              disabled={isPending}
              className={selectClass}
            >
              {STAGE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {STAGE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          {isPending && (
            <p className="text-sm text-zinc-500" role="status" aria-live="polite">
              Guardando cambios…
            </p>
          )}
        </div>
        {feedback && (
          <p
            aria-live="polite"
            className={`px-5 pb-4 text-sm ${
              feedback.tone === "success" ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {feedback.text}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <h2 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Información de contacto
        </h2>
        <dl className="divide-y divide-zinc-100 px-5 py-1">
          <DetailRow
            label="Email"
            value={candidate.email}
            href={`mailto:${candidate.email}`}
          />
          <DetailRow label="Teléfono" value={candidate.phone} />
          {candidate.linkedin_url && (
            <DetailRow
              label="LinkedIn"
              value="Abrir perfil"
              href={candidate.linkedin_url}
            />
          )}
          {candidate.cv_url && (
            <DetailRow label="CV" value="Ver documento" href={candidate.cv_url} />
          )}
        </dl>
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <h2 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Detalles del proceso
        </h2>
        <dl className="divide-y divide-zinc-100 px-5 py-1">
          <DetailRow
            label="Experiencia"
            value={`${candidate.experience_years} años`}
          />
          <DetailRow
            label="Fecha de aplicación"
            value={formatDate(candidate.applied_at)}
          />
          <DetailRow
            label="Última actualización"
            value={formatDate(candidate.updated_at)}
          />
          <DetailRow label="Notas" value={`${notes.length} nota(s)`} />
        </dl>
      </section>

      {/* Notas (GET /records/:id/notes) */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <h2 className="border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Notas
        </h2>
        <div className="flex flex-col gap-4 p-5">
          {/* Añadir nota (POST /records/:id/notes) */}
          <form onSubmit={handleAddNote} className="flex flex-col gap-2">
            <label htmlFor="new-note" className="sr-only">
              Nueva nota
            </label>
            <textarea
              id="new-note"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Añade una anotación sobre esta candidatura…"
              rows={3}
              className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isSavingNote || !newNote.trim()}
                className={buttonPrimary}
              >
                {isSavingNote ? "Guardando…" : "Añadir nota"}
              </button>
            </div>
          </form>

          {sortedNotes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
              Todavía no hay notas en esta candidatura.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" aria-label="Notas de la candidatura">
              {sortedNotes.map((note) => (
                <li
                  key={note.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <p className="whitespace-pre-wrap text-sm text-zinc-800">
                      {note.content}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {formatDate(note.created_at)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteNote(note.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
                    aria-label="Eliminar nota"
                  >
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}