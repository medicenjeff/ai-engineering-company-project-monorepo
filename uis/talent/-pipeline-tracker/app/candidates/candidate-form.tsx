"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createRecord, replaceRecord } from "@/lib/tracker-api";
import type { Candidate, CandidateInput } from "@/lib/tracker-types";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200";
const labelClass = "text-sm font-medium text-zinc-700";
const errorClass = "text-xs text-rose-600";
const buttonPrimary =
  "inline-flex items-center justify-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary =
  "inline-flex items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50";

export interface CandidateFormErrors {
  full_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  experience_years?: string;
  linkedin_url?: string;
  cv_url?: string;
}

interface CandidateFormProps {
  mode: "create" | "edit";
  candidate?: Candidate; // solo en modo edit
}

/** Validación de campos requeridos + formato antes de enviar. */
function validate(values: CandidateInput): CandidateFormErrors {
  const errors: CandidateFormErrors = {};

  if (!values.full_name.trim()) {
    errors.full_name = "El nombre es obligatorio.";
  }
  if (!values.email.trim()) {
    errors.email = "El email es obligatorio.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = "Introduce un email válido.";
  }
  if (!values.phone.trim()) {
    errors.phone = "El teléfono es obligatorio.";
  }
  if (!values.position.trim()) {
    errors.position = "El puesto es obligatorio.";
  }
  if (
    values.experience_years == null ||
    Number.isNaN(Number(values.experience_years)) ||
    Number(values.experience_years) < 0
  ) {
    errors.experience_years =
      "Indica los años de experiencia (número mayor o igual a 0).";
  }
  if (values.linkedin_url?.trim() && !/^https?:\/\/.+\..+/.test(values.linkedin_url.trim())) {
    errors.linkedin_url = "Debe ser una URL válida (http/https).";
  }
  if (values.cv_url?.trim() && !/^https?:\/\/.+\..+/.test(values.cv_url.trim())) {
    errors.cv_url = "Debe ser una URL válida (http/https).";
  }

  return errors;
}

export default function CandidateForm({ mode, candidate }: CandidateFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [values, setValues] = useState<CandidateInput>({
    full_name: candidate?.full_name ?? "",
    email: candidate?.email ?? "",
    phone: candidate?.phone ?? "",
    position: candidate?.position ?? "",
    experience_years:
      candidate?.experience_years != null ? candidate.experience_years : 0,
    linkedin_url: candidate?.linkedin_url ?? "",
    cv_url: candidate?.cv_url ?? "",
  });
  const [errors, setErrors] = useState<CandidateFormErrors>({});
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const setField = (field: keyof CandidateInput, value: string | number) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Limpia el error del campo al corregir
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    // Validación en cliente antes de enviar
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      return;
    }

    setIsSaving(true);
    try {
      const submitted: CandidateInput = {
        ...values,
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        position: values.position.trim(),
        experience_years: Number(values.experience_years),
        linkedin_url: values.linkedin_url?.trim() || null,
        cv_url: values.cv_url?.trim() || null,
      };

      let saved: Candidate;
      if (isEdit && candidate) {
        saved = await replaceRecord(candidate.id, submitted);
      } else {
        saved = await createRecord(submitted);
      }

      setFeedback({
        tone: "success",
        text: isEdit
          ? "Candidatura actualizada correctamente."
          : "Candidatura registrada correctamente.",
      });

      // Actualiza el estado del servidor (listados/cachés) sin recarga completa
      router.refresh();

      // Navega al detalle de la candidatura guardada
      setTimeout(() => router.push(`/candidates/${saved.id}`), 700);
    } catch {
      setFeedback({
        tone: "error",
        text: isEdit
          ? "No se pudo actualizar la candidatura. Inténtalo de nuevo."
          : "No se pudo registrar la candidatura. Inténtalo de nuevo.",
      });
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      noValidate={false}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className={labelClass} htmlFor="full_name">
            Nombre completo <span className="text-rose-500">*</span>
          </label>
          <input
            id="full_name"
            type="text"
            value={values.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            placeholder="Ej.: Laura García"
            aria-invalid={Boolean(errors.full_name)}
            className={inputClass}
          />
          {errors.full_name && <p className={errorClass}>{errors.full_name}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="email">
            Email <span className="text-rose-500">*</span>
          </label>
          <input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => setField("email", e.target.value)}
            placeholder="ej.: laura@nexova.es"
            aria-invalid={Boolean(errors.email)}
            className={inputClass}
          />
          {errors.email && <p className={errorClass}>{errors.email}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="phone">
            Teléfono <span className="text-rose-500">*</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(e) => setField("phone", e.target.value)}
            placeholder="Ej.: +34 600 000 000"
            aria-invalid={Boolean(errors.phone)}
            className={inputClass}
          />
          {errors.phone && <p className={errorClass}>{errors.phone}</p>}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className={labelClass} htmlFor="position">
            Puesto <span className="text-rose-500">*</span>
          </label>
          <input
            id="position"
            type="text"
            value={values.position}
            onChange={(e) => setField("position", e.target.value)}
            placeholder="Ej.: Desarrolladora Frontend"
            aria-invalid={Boolean(errors.position)}
            className={inputClass}
          />
          {errors.position && <p className={errorClass}>{errors.position}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="experience_years">
            Años de experiencia <span className="text-rose-500">*</span>
          </label>
          <input
            id="experience_years"
            type="number"
            min={0}
            step="any"
            value={values.experience_years}
            onChange={(e) => setField("experience_years", e.target.value)}
            placeholder="Ej.: 3"
            aria-invalid={Boolean(errors.experience_years)}
            className={inputClass}
          />
          {errors.experience_years && (
            <p className={errorClass}>{errors.experience_years}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} htmlFor="linkedin_url">
            LinkedIn (opcional)
          </label>
          <input
            id="linkedin_url"
            type="url"
            value={values.linkedin_url ?? ""}
            onChange={(e) => setField("linkedin_url", e.target.value)}
            placeholder="https://linkedin.com/in/..."
            aria-invalid={Boolean(errors.linkedin_url)}
            className={inputClass}
          />
          {errors.linkedin_url && (
            <p className={errorClass}>{errors.linkedin_url}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label className={labelClass} htmlFor="cv_url">
            Enlace al CV (opcional)
          </label>
          <input
            id="cv_url"
            type="url"
            value={values.cv_url ?? ""}
            onChange={(e) => setField("cv_url", e.target.value)}
            placeholder="https://.../cv.pdf"
            aria-invalid={Boolean(errors.cv_url)}
            className={inputClass}
          />
          {errors.cv_url && <p className={errorClass}>{errors.cv_url}</p>}
        </div>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {feedback.tone === "success" ? "✓ " : "✗ "}
          {feedback.text}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isSaving} className={buttonPrimary}>
          {isSaving
            ? "Guardando…"
            : isEdit
              ? "Guardar cambios"
              : "Registrar candidatura"}
        </button>
        <Link
          href={isEdit && candidate ? `/candidates/${candidate.id}` : "/"}
          className={buttonSecondary}
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}