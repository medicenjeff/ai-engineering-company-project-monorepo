import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

export async function legacyDocument() {
  let source: string;
  try {
    source = await readFile(path.join(process.cwd(), "index.html"), "utf8");
  } catch {
    throw new Error("No se pudo cargar el espacio de trabajo.");
  }
  const document = load(source);
  document("script[src], link[rel=stylesheet]").each((_, element) => {
    const attribute = element.tagName === "script" ? "src" : "href";
    const value = document(element).attr(attribute);
    if (value && !value.startsWith("http")) document(element).attr(attribute, `/legacy/${value}`);
  });
  document("head").prepend(`<script>
    const originalFetch = window.fetch.bind(window);
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      event.preventDefault();
      window.parent.location.hash = link.getAttribute('href');
      window.dispatchEvent(new Event('hashchange'));
    });
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, window.parent.location.origin);
      const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
      const token = localStorage.getItem('nexova.access_token');
      if (token) headers.set('Authorization', 'Bearer ' + token);
      let response;
      try {
        response = await originalFetch('/api/backend' + url.pathname + url.search, { ...options, headers });
      } catch {
        throw new Error('No se pudo conectar con el servicio. Comprueba tu conexión e inténtalo de nuevo.');
      }
      if (response.status === 401) {
        localStorage.removeItem('nexova.access_token');
        window.parent.location.replace('/login');
      }
      return response;
    };
    window.addEventListener('load', () => {
      new ResizeObserver(() => window.parent.postMessage({ type: 'nexova:height', height: document.documentElement.scrollHeight }, window.parent.location.origin)).observe(document.body);
    });
  </script>`);
  return document.html();
}