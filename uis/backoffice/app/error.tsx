"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="auth-loading" role="alert">
      <h1>No se pudo cargar el espacio de trabajo</h1>
      <p>Comprueba tu conexión e inténtalo de nuevo.</p>
      <button type="button" onClick={reset}>Reintentar</button>
      <Link href="/">Volver al inicio</Link>
    </main>
  );
}