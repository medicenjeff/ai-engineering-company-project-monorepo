import { readFile } from "node:fs/promises";
import path from "node:path";

export async function legacyAsset(_request: Request, context: { params: Promise<{ asset: string[] }> }) {
  const { asset } = await context.params;
  const relative = asset.join("/");
  if (!["styles.css", "app.js", "dist/styles.css", "dist/app.js"].includes(relative)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const content = await readFile(path.join(process.cwd(), relative));
    return new Response(content, {
      headers: { "Content-Type": relative.endsWith(".css") ? "text/css" : "application/javascript", "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}