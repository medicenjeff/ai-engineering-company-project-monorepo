export function getJwtSubject(token: string): string | null {
  const segments = token.split(".");
  if (segments.length !== 3 || !segments[1]) return null;

  const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    const claims: unknown = JSON.parse(atob(padded));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return null;
    const subject = (claims as { sub?: unknown }).sub;
    return typeof subject === "string" && subject.trim() ? subject : null;
  } catch {
    return null;
  }
}

export function isWithinBcryptLimit(password: string): boolean {
  return new TextEncoder().encode(password).length <= 72;
}

export function getAccessToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const token = (payload as { access_token?: unknown }).access_token;
  return typeof token === "string" && token.trim() ? token : null;
}