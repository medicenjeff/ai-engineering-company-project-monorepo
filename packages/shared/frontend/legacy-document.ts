import { readFile } from "node:fs/promises";
import path from "node:path";
import { load } from "cheerio";

export async function legacyDocument() {
  const source = await readFile(path.join(process.cwd(), "index.html"), "utf8");
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
      const response = await originalFetch('/api/backend' + url.pathname + url.search, { ...options, headers });
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