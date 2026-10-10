import { expect, type Page } from "@playwright/test";

export const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.test-signature";
export const account = { email: "member@example.com", role: "user", profile: { name: "Miembro", phone: "123", address: "Valencia" } };

export async function authenticatePage(page: Page) {
  await page.addInitScript((value) => localStorage.setItem("nexova.access_token", value), token);
  await page.route("**/api/backend/auth/me", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    return route.fulfill({ json: account });
  });
}