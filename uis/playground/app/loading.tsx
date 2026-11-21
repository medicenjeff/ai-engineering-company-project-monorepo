export default function Loading() {
  return (
    <main className="auth-loading" role="status" aria-busy="true">
      <span className="auth-loading-spinner" aria-hidden="true" />
      Cargando el espacio de trabajo...
    </main>
  );
}