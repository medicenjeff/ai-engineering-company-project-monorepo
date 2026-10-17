"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  stageLabel,
  statusLabel,
  formatDate,
  STATUS_LABELS,
  STAGE_LABELS,
} from "@/lib/tracker-types";
import type { CandidateListItem, CandidateStatus, CandidateStage } from "@/lib/tracker-types";
import { listRecords } from "@/lib/tracker-api";

interface CandidatesTableProps {
  candidates: CandidateListItem[];
  total: number;
}

const STATUS_KEYS = Object.keys(STATUS_LABELS) as CandidateStatus[];
const STAGE_KEYS = Object.keys(STAGE_LABELS) as CandidateStage[];

function StatusBadge({ status }: { status: CandidateStatus }) {
  const color: Record<CandidateStatus, string> = {
    received: "bg-sky-100 text-sky-800",
    in_progress: "bg-amber-100 text-amber-800",
    discarded: "bg-rose-100 text-rose-800",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function StageBadge({ stage }: { stage: CandidateStage }) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
      {stageLabel(stage)}
    </span>
  );
}

const selectClass =
  "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";

export default function CandidatesTable({ candidates, total }: CandidatesTableProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Estado de refetch: permite mostrar carga / éxito / error al actualizar
  // los datos desde el cliente (GET /records) sin recargar la página.
  const [records, setRecords] = useState<CandidateListItem[]>(candidates);
  const [totalCount, setTotalCount] = useState(total);
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const status = searchParams.get("status") ?? "";
  const stage = searchParams.get("stage") ?? "";
  const query = searchParams.get("q") ?? "";

  // Re-obtiene las candidaturas (GET /records) mostrando los tres estados UI:
  // cargando → éxito o error. Sin recarga completa (fetch en cliente).
  const handleRefresh = async () => {
    setRefreshState("loading");
    try {
      const data = await listRecords();
      setRecords(data.data);
      setTotalCount(data.total);
      setRefreshState("success");
      // Revalida el caché del servidor (30s) tras la actualización puntual.
      router.refresh();
    } catch {
      setRefreshState("error");
    }
  };

  // Actualiza un único parámetro manteniendo los demás; sin recarga (client-side).
  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const next = params.toString() ? `?${params.toString()}` : "";
      startTransition(() => {
        router.replace(`${pathname}${next}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((c) => {
      if (status && c.status !== status) return false;
      if (stage && c.stage !== stage) return false;
      if (q) {
        const haystack = `${c.full_name} ${c.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [records, status, stage, query]);

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de búsqueda y filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 shadow-sm focus-within:border-zinc-500 focus-within:ring-2 focus-within:ring-zinc-200">
          <svg
            className="h-4 w-4 shrink-0 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setParam("q", e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            aria-label="Buscar por nombre o email"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshState === "loading"}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Actualizar candidaturas"
          >
            {refreshState === "loading" ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                Actualizando…
              </>
            ) : (
              <>
                <span aria-hidden className="text-base leading-none">⟳</span>
                Actualizar
              </>
            )}
          </button>

          <Link
            href="/candidates/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            <span aria-hidden className="text-base leading-none">＋</span>
            Nueva candidatura
          </Link>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="sr-only">Estado</span>
            <select
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
              className={selectClass}
            >
              <option value="">Estado: todos</option>
              {STATUS_KEYS.map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="sr-only">Etapa</span>
            <select
              value={stage}
              onChange={(e) => setParam("stage", e.target.value)}
              className={selectClass}
            >
              <option value="">Etapa: todas</option>
              {STAGE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {STAGE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Contador de resultados */}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-zinc-500" aria-live="polite">
          {isPending ? (
            <span className="inline-flex items-center gap-2 text-zinc-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
              Actualizando…
            </span>
          ) : (
            <>
              Mostrando <span className="font-semibold text-zinc-700">{filtered.length}</span> de{" "}
              <span className="font-semibold text-zinc-700">{totalCount}</span> candidaturas
            </>
          )}
        </p>
        {refreshState === "error" && (
          <p className="text-sm text-rose-600" role="alert">
            No se pudo actualizar la lista. Comprueba tu conexión e inténtalo de nuevo.
          </p>
        )}
        {refreshState === "success" && (
          <p className="text-sm text-emerald-600" role="status" aria-live="polite">
            Listado actualizado correctamente.
          </p>
        )}
      </div>

      {/* Tabla de resultados */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-sm">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Candidato</th>
                <th className="hidden px-4 py-3 md:table-cell">Posición</th>
                <th className="hidden px-4 py-3 lg:table-cell">Experiencia</th>
                <th className="hidden px-4 py-3 sm:table-cell">Etapa</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Aplicó</th>
                <th className="px-4 py-3 text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((candidate) => (
                <tr key={candidate.id} className="transition-colors hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="font-semibold text-zinc-900">{candidate.full_name}</div>
                    <div className="text-xs text-zinc-500">{candidate.email}</div>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-zinc-700 md:table-cell">
                    {candidate.position}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-zinc-700 lg:table-cell">
                    {candidate.experience_years} años
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">
                    <StageBadge stage={candidate.stage} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge status={candidate.status} />
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-zinc-600 md:table-cell">
                    {formatDate(candidate.applied_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <Link
                      href={`/candidates/${candidate.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                    >
                      Ver candidatura
                      <span aria-hidden>→</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {filtered.length === 0 && (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No hay candidaturas que coincidan con los filtros actuales.
        </p>
      )}
    </div>
  );
}