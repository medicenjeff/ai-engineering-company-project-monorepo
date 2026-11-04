import { test, expect, type Page } from "@playwright/test";
import { authenticatePage, token } from "./session";

const summary = {
  by_status: { open: 27, resolved: 56, discarded: 13 },
  by_category: { technical_failure: 49, process_error: 35, client_complaint: 12 },
  by_origin: { customer: 96 },
  by_branch: { central: 96 },
};
const endpoint = "**/api/backend/api/incidents/summary";

async function openSummary(page: Page) {
  await authenticatePage(page);
  await page.goto("/#summary");
  return page.frameLocator("iframe");
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "backoffice", "El resumen pertenece al backoffice");
});

test("resumen: conteos transformados del briefing y oficinas exactas", async ({ page }) => {
  await page.route(endpoint, (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
    return route.fulfill({ json: summary });
  });
  const view = await openSummary(page);
  await expect(view.locator("#summary-total")).toHaveText("96");
  await expect(view.locator("[data-summary-group]")).toHaveCount(4);
  for (const [dimension, values] of Object.entries(summary)) {
    const group = view.locator(`[data-summary-group="${dimension}"]`);
    for (const [value, count] of Object.entries(values)) {
      await expect(group.locator(`[data-summary-value="${value}"] .bar-count`)).toHaveText(String(count));
    }
  }
  const branches = { central: 24, valencia_operations: 24, miami_office: 24, remote: 24 };
  await page.route(endpoint, (route) => route.fulfill({ json: { ...summary, by_branch: branches } }));
  await view.locator("#refresh-summary").click();
  const branchGroup = view.locator('[data-summary-group="by_branch"]');
  await expect(branchGroup.locator(".summary-bar-label")).toHaveText([
    "Central — Sede Valencia", "Valencia — Operaciones", "Miami Office", "Remoto (empleado sin sede fija)",
  ]);
  await expect(view.locator("#summary-updated")).toContainText("Actualizado");
});

test("resumen: carga lenta no bloquea la navegacion", async ({ page }) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(endpoint, async (route) => {
    await pending;
    await route.fulfill({ json: summary });
  });
  const view = await openSummary(page);
  await expect(view.locator("#summary-loading")).toBeVisible();
  await expect(view.locator("#summary-panel")).toHaveAttribute("aria-busy", "true");
  await expect(view.locator("#refresh-summary")).toBeDisabled();
  await view.locator('.nav-item[href="#analysis"]').click();
  await expect(view.locator("#analysis-view")).toBeVisible();
  release();
  await view.locator('a[href="#summary"]').click();
  await expect(view.locator("#summary-total")).toHaveText("96");
  await expect(view.locator("#summary-loading")).toBeHidden();
});

for (const failure of ["http", "network", "html", "missing-fields", "invalid-count", "inconsistent-totals"] as const) {
  test(`resumen: error ${failure} recuperable sin romper la pagina`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route(endpoint, (route) => {
      if (failure === "network") return route.abort("failed");
      if (failure === "http") return route.fulfill({ status: 503, json: { detail: "Traceback /srv/private/summary.py" } });
      if (failure === "html") return route.fulfill({ contentType: "text/html", body: "Unavailable" });
      if (failure === "missing-fields") return route.fulfill({ json: {} });
      if (failure === "inconsistent-totals") return route.fulfill({ json: { ...summary, by_branch: { central: 1 } } });
      return route.fulfill({ json: { ...summary, by_category: { technical_failure: -1 } } });
    });
    const view = await openSummary(page);
    await expect(view.locator("#summary-error")).toBeVisible();
    await expect(view.locator("#summary-error-msg")).not.toContainText("Traceback");
    await expect(view.locator("#summary-error-msg")).not.toContainText("/srv/private");
    await expect(view.locator("#summary-groups")).toBeHidden();
    await expect(view.locator("#summary-empty")).toBeHidden();
    await expect(view.locator("#summary-loading")).toBeHidden();
    await view.locator('.nav-item[href="#analysis"]').click();
    await expect(view.locator("#analysis-view")).toBeVisible();
    await view.locator('a[href="#summary"]').click();
    await expect(view.locator("#summary-error")).toBeVisible();
    await page.route(endpoint, (route) => route.fulfill({ json: summary }));
    await view.locator("#summary-retry-btn").click();
    await expect(view.locator("#summary-total")).toHaveText("96");
    await expect(view.locator("#summary-groups")).toBeVisible();
    await expect(view.locator("#summary-error")).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test("resumen: sin incidencias muestra mensaje informativo", async ({ page }) => {
  await page.route(endpoint, (route) => route.fulfill({ json: {
    by_status: {}, by_category: {}, by_origin: {}, by_branch: {},
  } }));
  const view = await openSummary(page);
  await expect(view.locator("#summary-total")).toHaveText("0");
  await expect(view.locator("#summary-empty")).toBeVisible();
  await expect(view.locator("#summary-groups")).toBeHidden();
  await expect(view.locator("#summary-error")).toBeHidden();
});

for (const width of [1440, 390]) {
  test(`resumen: todas las categorias del briefing a ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const categories = { technical_failure: 1, process_error: 1, client_complaint: 1, candidate_issue: 1, staff_issue: 1, sla_breach: 1, data_quality: 1, other: 1 };
    await page.route(endpoint, (route) => route.fulfill({ json: {
      by_status: { open: 2, in_progress: 2, resolved: 2, discarded: 2 },
      by_category: categories,
      by_origin: { customer: 4, branch: 2, internal: 2 },
      by_branch: { central: 2, valencia_operations: 2, miami_office: 2, remote: 2 },
    } }));
    const view = await openSummary(page);
    await expect(view.locator("#summary-total")).toHaveText("8");
    await expect(view.locator('[data-summary-group="by_category"] .summary-bar-label')).toHaveText(Object.keys(categories));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await view.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await view.locator(".summary-bar-label").evaluateAll((labels) => labels.every((label) =>
      label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight,
    ))).toBe(true);
    await page.screenshot({ path: `test-results/${testInfo.project.name}-summary-${width}.png`, fullPage: true });
  });
}