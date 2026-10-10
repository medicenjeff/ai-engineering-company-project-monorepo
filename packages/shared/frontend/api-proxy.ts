export async function proxyApi(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const base = process.env.FASTAPI_URL || "http://127.0.0.1:8000";
  const url = new URL(path.map(encodeURIComponent).join("/"), `${base.replace(/\/$/, "")}/`);
  url.search = new URL(request.url).search;
  const headers = new Headers();
  for (const name of ["authorization", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: await request.arrayBuffer() }),
      cache: "no-store",
      redirect: "manual",
    });
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition", "www-authenticate"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json({ detail: "La API no esta disponible. Intentalo de nuevo." }, { status: 502 });
  }
}