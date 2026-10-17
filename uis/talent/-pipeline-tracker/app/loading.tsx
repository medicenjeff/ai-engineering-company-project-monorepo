export default function Loading() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-10" aria-busy="true">
      <header className="flex flex-col gap-3">
        <div className="h-7 w-48 animate-pulse rounded-md bg-zinc-200" />
        <div className="h-4 w-64 animate-pulse rounded-md bg-zinc-200" />
      </header>

      {/* Filtros */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="h-9 w-full max-w-sm animate-pulse rounded-md bg-zinc-100" />
        <div className="flex gap-3">
          <div className="h-9 w-36 animate-pulse rounded-md bg-zinc-100" />
          <div className="h-9 w-36 animate-pulse rounded-md bg-zinc-100" />
        </div>
      </div>

      {/* Tabla */}
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="space-y-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-6 border-b border-zinc-100 px-4 py-4 last:border-b-0"
            >
              <div className="flex flex-1 flex-col gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-56 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="hidden h-4 w-32 animate-pulse rounded bg-zinc-100 md:block" />
              <div className="hidden h-6 w-20 animate-pulse rounded-full bg-zinc-100 sm:block" />
              <div className="h-6 w-24 animate-pulse rounded-full bg-zinc-100" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}