/**
 * Tipos de datos del Talent Pipeline Tracker.
 *
 * Duplican (intencionalmente, de forma ligera) la respuesta real de la API de
 * 4Geeks (`https://playground.4geeks.com/tracker/api/v1/records`).
 */

export type CandidateStatus = "received" | "in_progress" | "discarded";

export type CandidateStage =
  | "pending"
  | "review"
  | "personal_interview"
  | "technical_interview";

export interface CandidateNote {
  id: string;
  record_id: string;
  content: string;
  created_at: string;
}

/** Candidatura completa tal y como la devuelve `GET /records/:id`. */
export interface Candidate {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  position: string;
  linkedin_url: string | null;
  cv_url: string | null;
  status: CandidateStatus;
  stage: CandidateStage;
  experience_years: number;
  notes_count: number;
  applied_at: string;
  updated_at: string;
}

/** Candidatura en el listado `GET /records` (incluye notas embebidas). */
export interface CandidateListItem extends Candidate {
  notes: CandidateNote[];
}

/** Respuesta paginada de `GET /records`. */
export interface RecordsResponse {
  total: number;
  page: number;
  limit: number;
  data: CandidateListItem[];
}

/** Respuesta de `GET /records/:id/notes`. */
export interface NotesResponse {
  data: CandidateNote[];
  meta: {
    total: number;
  };
}

/** Payload para crear/editar una candidatura (`POST/PUT /records`).
 *
 * `status` y `stage` no se envían: el servidor asigna defaults en el alta
 * y los preserva en la edición (se gestionan por separado con PATCH).
 */
export interface CandidateInput {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  experience_years: number;
  linkedin_url?: string | null;
  cv_url?: string | null;
}

/** Convierte una candidatura existente en valores iniciales del formulario
 *  (los enlaces opcionales llegan como cadena vacía para los inputs). */
export function toCandidateInput(candidate: Candidate): CandidateInput {
  return {
    full_name: candidate.full_name,
    email: candidate.email,
    phone: candidate.phone,
    position: candidate.position,
    experience_years: candidate.experience_years,
    linkedin_url: candidate.linkedin_url ?? "",
    cv_url: candidate.cv_url ?? "",
  };
}

export const STATUS_LABELS: Record<CandidateStatus, string> = {
  received: "Recibida",
  in_progress: "En proceso",
  discarded: "Descartada",
};

export const STAGE_LABELS: Record<CandidateStage, string> = {
  pending: "Pendiente",
  review: "En revisión",
  personal_interview: "Entrevista personal",
  technical_interview: "Entrevista técnica",
};

/** Devuelve una etiqueta legible o el valor original si no se conoce. */
export function statusLabel(status: CandidateStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function stageLabel(stage: CandidateStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}