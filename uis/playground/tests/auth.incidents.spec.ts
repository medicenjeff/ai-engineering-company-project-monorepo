import { test, expect, type Page } from "@playwright/test";
import { authenticatePage, token } from "./session";

const incidents = [
  { id: "incident-1", title: "Acceso a plataforma", description: "Revisar el acceso", category: "technical_failure", origin: "internal", branch: "central", status: "open", updated_at: "2026-11-04T10:00:00Z" },
  { id: "incident-2", title: "Entrega pendiente", description: "Revisar la entrega", category: "process_error", origin: "customer", branch: "miami_office", status: "in_progress", updated_at: "2026-11-04T11:00:00Z" },
];

async function openPanel(page: Page) {
  await authenticatePage(page);
  await page.goto("/#incident-list");
  return page.frameLocator("iframe");
}

async function mockList(page: Page) {
  await page.route("**/api/backend/api/incidents{,?*}", (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    const filters = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: incidents.filter((incident) =>
      ["status", "origin", "branch"].every((field) => !filters.has(field) || filters.get(field) === incident[field as keyof typeof incident]),
    ) });
  });
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "backoffice", "El panel pertenece al backoffice");
});

test("incidencias: registro real con categorias y sedes del briefing", async ({ page }) => {
  await authenticatePage(page);
  await page.goto("/#incident-form");
  const view = page.frameLocator("iframe");
  await expect(view.locator("#incident-category")).toBeVisible();
  expect(await view.locator("#incident-category option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual([
    "other", "technical_failure", "process_error", "client_complaint", "candidate_issue", "staff_issue", "sla_breach", "data_quality",
  ]);
  await expect(view.locator("#incident-branch option")).toHaveText([
    "Central — Sede Valencia", "Valencia — Operaciones", "Miami Office", "Remoto (empleado sin sede fija)",
  ]);
  await view.locator("#incident-title").fill("SLA incumplido para cliente de Nexova");
  await view.locator("#incident-description").fill("El equipo remoto necesita revisar los tiempos de respuesta.");
  await view.locator("#incident-category").selectOption("sla_breach");
  await view.locator("#incident-origin").selectOption("customer");
  await view.locator("#incident-branch").selectOption("remote");
  const response = page.waitForResponse((response) => response.url().endsWith("/api/backend/api/incidents") && response.request().method() === "POST");
  await view.locator("#create-incident-button").click();
  const created = await response;
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ category: "sla_breach", origin: "customer", branch: "remote", status: "open" });
  await expect(view.locator("#incident-success")).toBeVisible();
  await expect(view.locator("#incident-category")).toHaveValue("other");
});

test("incidencias: validacion cliente, resaltado de sede y estado de envio", async ({ page }) => {
  let requests = 0;
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backend/api/incidents", async (route) => {
    requests += 1;
    await pending;
    await route.fulfill({ status: 201, json: { title: "Incidencia de prueba" } });
  });
  await authenticatePage(page);
  await page.goto("/#incident-form");
  const view = page.frameLocator("iframe");
  await view.locator("#incident-description").fill("Descripción de prueba.");
  await view.locator("#create-incident-button").click();
  await expect(view.locator("#incident-title-error")).toHaveText("El título es obligatorio.");
  expect(requests).toBe(0);

  await view.locator("#incident-title").fill("Prueba de sede remota");
  await view.locator("#incident-description").fill("");
  await view.locator("#create-incident-button").click();
  await expect(view.locator("#incident-description-error")).toHaveText("La descripción es obligatoria.");
  expect(requests).toBe(0);

  await view.locator("#incident-description").fill("Descripción de prueba.");
  for (const [field, error, message] of [
    ["#incident-category", "#incident-category-error", "Selecciona una categoría."],
    ["#incident-origin", "#incident-origin-error", "Selecciona un origen."],
    ["#incident-branch", "#incident-branch-error", "Selecciona una sede."],
  ]) {
    await view.locator(field).evaluate((element) => { (element as HTMLSelectElement).value = ""; });
    await view.locator("#create-incident-button").click();
    await expect(view.locator(error)).toHaveText(message);
    expect(requests).toBe(0);
  }
  await view.locator("#incident-category").selectOption("other");
  await view.locator("#incident-origin").selectOption("branch");
  await expect(view.locator("#incident-branch-container")).toHaveClass(/highlight/);
  await expect(view.locator("#branch-hint")).toContainText("indica la sede afectada");
  await view.locator("#incident-branch").selectOption("remote");
  await view.locator("#create-incident-button").click();
  await expect(view.locator("#create-incident-button")).toBeDisabled();
  await expect(view.locator("#incident-btn-text")).toHaveText("Registrando…");
  await expect(view.locator("#incident-title")).toBeDisabled();
  expect(requests).toBe(1);
  release();
  await expect(view.locator("#incident-success")).toBeVisible();
  await expect(view.locator("#create-incident-button")).toBeEnabled();
});

test("incidencias: errores de validacion API son comprensibles y sin detalles tecnicos", async ({ page }) => {
  await page.route("**/api/backend/api/incidents", (route) => route.fulfill({
    status: 400,
    json: { detail: "pydantic enum IncidentCategory at /srv/internal", errors: [{ field: "category", message: "Input should be one of the enum values" }] },
  }));
  await authenticatePage(page);
  await page.goto("/#incident-form");
  const view = page.frameLocator("iframe");
  await view.locator("#incident-title").fill("Acceso al ATS");
  await view.locator("#incident-description").fill("No es posible acceder al ATS.");
  await view.locator("#create-incident-button").click();
  await expect(view.locator("#incident-category-error")).toHaveText("Selecciona una categoría válida.");
  await expect(view.locator("#incident-form-error")).toHaveText("No se pudo registrar la incidencia. Revisa los campos indicados e inténtalo de nuevo.");
  await expect(view.locator("#incident-form-error")).not.toContainText("pydantic");
  await expect(view.locator("#incident-form-error")).not.toContainText("/srv/internal");
});

test("incidencias: carga, filtros combinados y vacios informativos", async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backend/api/incidents{,?*}", async (route) => {
    await pending;
    const filters = new URL(route.request().url()).searchParams;
    await route.fulfill({ json: incidents.filter((incident) =>
      ["status", "origin", "branch"].every((field) => !filters.has(field) || filters.get(field) === incident[field as keyof typeof incident]),
    ) });
  });
  const view = await openPanel(page);
  await expect(view.locator("#incident-loading")).toBeVisible();
  await expect(view.locator("#incident-table-wrap")).toBeHidden();
  release();
  await expect(view.locator("#incident-rows tr")).toHaveCount(2);
  await view.locator("#incident-filter-status").selectOption("open");
  await expect(view.locator("#incident-rows tr")).toHaveCount(1);
  await view.locator("#incident-filter-origin").selectOption("internal");
  await expect(view.locator("#incident-loading")).toBeHidden();
  const request = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.searchParams.get("status") === "open" && url.searchParams.get("origin") === "internal" && url.searchParams.get("branch") === "miami_office";
  });
  await view.locator("#incident-filter-branch").selectOption("miami_office");
  await request;
  await expect(view.locator("#incident-empty")).toBeVisible();
  await expect(view.locator("#incident-empty-title")).toContainText("coincide con los filtros");
  await expect(view.locator("#incident-table-wrap")).toBeHidden();
  await view.locator("#incident-empty-clear").click();
  await expect(view.locator("#incident-rows tr")).toHaveCount(2);
  await page.route("**/api/backend/api/incidents{,?*}", (route) => route.fulfill({ json: [] }));
  await view.locator("#refresh-incidents").click();
  await expect(view.locator("#incident-empty-title")).toHaveText("Todavía no hay incidencias");
  await expect(view.locator("#incident-table-wrap")).toBeHidden();
});

for (const failure of ["http", "network", "invalid-json"] as const) {
  test(`incidencias: error ${failure} y reintento`, async ({ page }) => {
    await page.route("**/api/backend/api/incidents{,?*}", (route) => {
      if (failure === "network") return route.abort("failed");
      if (failure === "invalid-json") return route.fulfill({ contentType: "text/html", body: "unavailable" });
      return route.fulfill({ status: 503, json: { detail: "Traceback at /srv/private/database.py:84" } });
    });
    const view = await openPanel(page);
    await expect(view.locator("#incident-list-error")).toBeVisible();
    await expect(view.locator("#incident-loading")).toBeHidden();
    await expect(view.locator("#incident-table-wrap")).toBeHidden();
    await expect(view.locator("#incident-list-error-msg")).not.toContainText("Traceback");
    await expect(view.locator("#incident-list-error-msg")).not.toContainText("/srv/private");
    await mockList(page);
    await view.locator("#incident-retry-btn").click();
    await expect(view.locator("#incident-rows tr")).toHaveCount(2);
    await expect(view.locator("#incident-list-error")).toBeHidden();
  });
}

test("incidencias: actualizacion optimista, rollback y reintento", async ({ page }) => {
  await mockList(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/backend/api/incidents/incident-1/status", async (route) => {
    calls += 1;
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ status: "in_progress" });
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    if (calls === 1) {
      await pending;
      return route.fulfill({ status: 500, json: { detail: "Traceback /srv/private/database.py" } });
    }
    return route.fulfill({ json: { ...incidents[0], status: "in_progress" } });
  });
  const view = await openPanel(page);
  const row = view.locator('[data-incident-row="incident-1"]');
  await row.getByRole("button", { name: /^Iniciar:/ }).click();
  await expect(row.locator(".status-badge")).toHaveText("En curso");
  await expect(row).toContainText("Guardando");
  await expect(row.getByRole("button")).toHaveCount(0);
  release();
  await expect(row.locator(".status-badge")).toHaveText("Abierta");
  await expect(view.locator("#incident-notice-error")).toContainText("Se ha restaurado el estado «Abierta»");
  await expect(view.locator("#incident-notice-error")).not.toContainText("Traceback");
  await expect(view.locator("#incident-notice-error")).not.toContainText("/srv/private");
  await row.getByRole("button", { name: /^Iniciar:/ }).click();
  await expect(view.locator("#incident-notice-success")).toBeVisible();
  await expect(row.locator(".status-badge")).toHaveText("En curso");
  expect(calls).toBe(2);
});

for (const failed of [false, true]) {
test(`incidencias: actualizacion pendiente ${failed ? "fallida" : "correcta"} respeta los filtros actuales`, async ({ page }) => {
  await mockList(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backend/api/incidents/incident-1/status", async (route) => {
    await pending;
    await route.fulfill(failed
      ? { status: 500, json: { detail: "Traceback /srv/private/database.py" } }
      : { json: { ...incidents[0], status: "in_progress" } });
  });
  const view = await openPanel(page);
  await view.locator('[data-incident-row="incident-1"]').getByRole("button", { name: /^Iniciar:/ }).click();
  await view.locator("#incident-filter-origin").selectOption("customer");
  await expect(view.locator("#incident-rows tr")).toHaveCount(1);
  await expect(view.locator("#incident-rows")).toContainText("Entrega pendiente");
  release();
  await expect(view.locator(failed ? "#incident-notice-error" : "#incident-notice-success")).toBeVisible();
  await expect(view.locator("#incident-rows tr")).toHaveCount(1);
  await expect(view.locator("#incident-rows")).not.toContainText("Acceso a plataforma");
  await expect(view.locator("#incident-count")).toContainText("1");
});
}

test("incidencias: guardados simultaneos conservan la identidad de cada fila", async ({ page }) => {
  await mockList(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/backend/api/incidents/*/status", async (route) => {
    const first = route.request().url().includes("incident-1/status");
    if (!first) await pending;
    await route.fulfill({ json: { ...incidents[first ? 0 : 1], status: "discarded" } });
  });
  const view = await openPanel(page);
  await view.locator("#incident-filter-status").selectOption("open");
  await expect(view.locator("#incident-rows tr")).toHaveCount(1);
  await view.locator("#incident-clear-filters").click();
  await expect(view.locator("#incident-rows tr")).toHaveCount(2);
  await view.locator('[data-incident-row="incident-2"]').getByRole("button", { name: /^Descartar:/ }).click();
  await view.locator('[data-incident-row="incident-1"]').getByRole("button", { name: /^Descartar:/ }).click();
  await expect(view.locator('[data-incident-row="incident-1"] .status-badge')).toHaveText("Descartada");
  release();
  await expect(view.locator('[data-incident-row="incident-2"] .status-badge')).toHaveText("Descartada");
  await expect(view.locator("#incident-rows tr")).toHaveCount(2);
  await expect(view.locator(".incident-pending")).toHaveCount(0);
});

for (const width of [1440, 390]) {
  test(`incidencias: presentacion a ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await mockList(page);
    const view = await openPanel(page);
    await expect(view.locator("#incident-rows tr")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await view.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/${testInfo.project.name}-incidents-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}