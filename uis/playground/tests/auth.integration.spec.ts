import { test, expect } from "@playwright/test";

test("sesion y perfil mediante proxy con FastAPI real", async ({ page }, testInfo) => {
  const email = `auth-${testInfo.project.name}-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.locator("#auth-name").fill("Integracion Nexova");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-test-password");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.getByRole("link", { name: "Mi cuenta" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("nexova.access_token"))).toBeTruthy();
  await page.getByRole("link", { name: "Mi perfil", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.locator("dd")).toHaveText(email);
  await page.getByLabel("Nombre", { exact: true }).fill("Perfil persistido");
  await page.getByLabel("Telefono").fill("+34 612345678");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(page.getByRole("status")).toHaveText("Perfil actualizado.");
  await page.reload();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Perfil persistido");
  await expect(page.getByLabel("Telefono")).toHaveValue("+34 612345678");
  await page.getByRole("button", { name: "Cerrar sesion" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill("secure-test-password");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator("iframe")).toBeVisible();
});