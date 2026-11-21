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

function statusMessage(status: number): string {
  if (status === 404) return "No se encontró el recurso solicitado.";
  if (status === 400 || status === 422) return "No se pudieron validar los datos enviados.";
  if (status >= 500) return "El servicio tuvo un problema. Inténtalo de nuevo.";
  return "No se pudo completar la solicitud. Inténtalo de nuevo.";
}

async function fetchResponse(
  path: string,
  options: RequestInit,
  revalidate = false
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...(revalidate ? { next: { revalidate: 30 } } : { cache: options.cache }),
    });
  } catch {
    throw new TrackerApiError(
      "No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.",
      0
    );
  }

  if (!response.ok) {
    throw new TrackerApiError(statusMessage(response.status), response.status);
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new TrackerApiError(
      "El servicio devolvió una respuesta no válida. Inténtalo de nuevo.",
      response.status
    );
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error(
      "Falta NEXT_PUBLIC_API_URL en el entorno. Revisa el archivo .env.local."
    );
  }
  const response = await fetchResponse(path, options ?? {}, true);
  return readJson<T>(response);
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

  const response = await fetchResponse(path, { ...options, cache: "no-store" });
  if (response.status === 204) {
    return null;
  }
  return readJson<T>(response);
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