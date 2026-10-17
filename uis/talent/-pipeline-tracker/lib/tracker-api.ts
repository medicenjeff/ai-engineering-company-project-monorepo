import type {
  Candidate,
  CandidateInput,
  CandidateNote,
  NotesResponse,
  RecordsResponse,
} from "./tracker-types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export class TrackerApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TrackerApiError";
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error(
      "Falta NEXT_PUBLIC_API_URL en el entorno. Revisa el archivo .env.local."
    );
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    // Datos semidinámicos: se revalidan en el servidor cada 30s,
    // manteniendo la navegación rápida sin recargas completas.
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new TrackerApiError(
      `Error al consultar la API (${response.status})`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

/** Petición de mutación: sin caché, devuelve JSON si hay body (PATCH/POST)
 *  o `null` si la API responde 204 sin contenido (DELETE). */
async function mutate<T>(
  path: string,
  options: RequestInit
): Promise<T | null> {
  if (!API_URL) {
    throw new Error(
      "Falta NEXT_PUBLIC_API_URL en el entorno. Revisa el archivo .env.local."
    );
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new TrackerApiError(
      `Error al consultar la API (${response.status})`,
      response.status
    );
  }

  if (response.status === 204) {
    return null;
  }

  return response.json() as Promise<T>;
}

/** Obtiene la lista paginada de candidaturas (`GET /records`).
 *
 * Pide `limit=100` para disponer del dataset completo
 * y poder filtrar/buscar en el cliente (la API documenta un máximo de 100 por respuesta).
 */
export async function listRecords(): Promise<RecordsResponse> {
  return request<RecordsResponse>("/records?limit=100");
}

/** Obtiene el detalle de una candidatura (`GET /records/:id`). */
export async function getRecord(id: string): Promise<Candidate> {
  return request<Candidate>(`/records/${encodeURIComponent(id)}`);
}

/** Crea una candidatura nueva (`POST /records`). */
export async function createRecord(input: CandidateInput): Promise<Candidate> {
  const created = await mutate<Candidate>("/records", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!created) {
    throw new TrackerApiError("La API no devolvió la candidatura creada", 0);
  }
  return created;
}

/** Reemplaza los datos básicos de una candidatura (`PUT /records/:id`).
 *
 * No envía `status`/`stage`: el servidor los preserva en la edición
 * (se gestionan por separado desde el detalle con PATCH).
 */
export async function replaceRecord(
  id: string,
  input: CandidateInput
): Promise<Candidate> {
  const replaced = await mutate<Candidate>(
    `/records/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    }
  );
  if (!replaced) {
    throw new TrackerApiError(
      "La API no devolvió la candidatura actualizada",
      0
    );
  }
  return replaced;
}

/** Actualiza el estado o la etapa de una candidatura (`PATCH /records/:id`). */
export async function updateRecord(
  id: string,
  patch: Partial<Pick<Candidate, "status" | "stage">>
): Promise<Candidate> {
  const updated = await mutate<Candidate>(`/records/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!updated) {
    throw new TrackerApiError("La API no devolvió la candidatura actualizada", 0);
  }
  return updated;
}

/** Obtiene las notas de una candidatura (`GET /records/:id/notes`). */
export async function listNotes(id: string): Promise<NotesResponse> {
  return request<NotesResponse>(`/records/${encodeURIComponent(id)}/notes`);
}

/** Añade una nota nueva a una candidatura (`POST /records/:id/notes`). */
export async function createNote(
  id: string,
  content: string
): Promise<CandidateNote> {
  const note = await mutate<CandidateNote>(
    `/records/${encodeURIComponent(id)}/notes`,
    { method: "POST", body: JSON.stringify({ content }) }
  );
  if (!note) {
    throw new TrackerApiError("La API no devolvió la nota creada", 0);
  }
  return note;
}

/** Elimina una nota de una candidatura (`DELETE /records/:id/notes/:note_id`). */
export async function deleteNote(id: string, noteId: string): Promise<void> {
  await mutate<unknown>(
    `/records/${encodeURIComponent(id)}/notes/${encodeURIComponent(noteId)}`,
    { method: "DELETE" }
  );
}