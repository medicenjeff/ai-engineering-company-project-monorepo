import { getAccessToken, getJwtSubject, isWithinBcryptLimit } from "./auth-utils";

function makeToken(payload: unknown): string {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `header.${encodedPayload}.signature`;
}

describe("getJwtSubject", () => {
  it("returns the subject from a well-formed JWT payload", () => {
    expect(getJwtSubject(makeToken({ sub: "user-123", role: "user" }))).toBe("user-123");
  });

  it.each([
    "",
    "header.payload",
    "header.!.signature",
    makeToken({ role: "user" }),
    makeToken({ sub: "" }),
    makeToken(null),
  ])("returns null for malformed or missing subject claims", (token) => {
    expect(getJwtSubject(token)).toBeNull();
  });
});

describe("isWithinBcryptLimit", () => {
  it("accepts passwords at or below 72 UTF-8 bytes", () => {
    expect(isWithinBcryptLimit("a".repeat(72))).toBe(true);
    expect(isWithinBcryptLimit("é".repeat(36))).toBe(true);
  });

  it("rejects passwords above 72 UTF-8 bytes", () => {
    expect(isWithinBcryptLimit("a".repeat(73))).toBe(false);
    expect(isWithinBcryptLimit("é".repeat(37))).toBe(false);
  });
});

describe("getAccessToken", () => {
  it("returns a non-empty access token from an API payload", () => {
    expect(getAccessToken({ access_token: "signed-token" })).toBe("signed-token");
  });

  it.each([null, undefined, {}, { access_token: "" }, { access_token: "  " }, { access_token: 123 }, []])(
    "rejects missing or malformed access-token payloads",
    (payload) => {
      expect(getAccessToken(payload)).toBeNull();
    },
  );
});