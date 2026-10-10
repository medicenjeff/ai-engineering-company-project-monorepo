import { test, expect, type Page } from "@playwright/test";
import { crearProveedor, type Proveedor, type CriterioOrden } from "../../../packages/shared/index";
import {
  crearEstadoVista,
  filtrarVista,
  ordenarVista,
  buscarEnVista,
  generarReporteVista,
  interpretarNumeroOpcional,
  type EstadoVista,
} from "../operaciones";

test("operaciones puras con estado y entradas congelados", (): void => {
  const proveedor: Proveedor = crearProveedor(
    {
      name: "Levante Executive Search",
      country: "España",
      product_categories: ["executive_search"],
      rate: 125,
      status: "active",
    },
    "2026-10-10T12:00:00Z",
  );
  Object.freeze(proveedor.product_categories);
  Object.freeze(proveedor);
  const proveedores: readonly Proveedor[] = Object.freeze([proveedor]);
  const estado: EstadoVista = Object.freeze(crearEstadoVista(proveedores, "Inicial"));
  Object.freeze(estado.proveedores);
  const criterio: CriterioOrden<Proveedor> = Object.freeze({ campo: "rate", direccion: "asc" });
  const criterios: readonly CriterioOrden<Proveedor>[] = Object.freeze([criterio]);
  expect(ordenarVista(estado, criterios)).toEqual(ordenarVista(estado, criterios));
  expect(buscarEnVista(estado, criterio, 125, "binary").busqueda).toBe(proveedor);
  expect(filtrarVista(proveedores, Object.freeze({ status: "suspended" })).proveedores).toEqual([]);
  expect(generarReporteVista(estado).reporte?.rate.total).toBe(125);
  expect(estado.operacion).toBe("Inicial");
  expect(estado.reporte).toBeNull();
  expect(estado.busqueda).toBeUndefined();
  expect(estado.proveedores).toEqual(proveedores);
});

test("operaciones puras manejan vacíos, ausencia y números inválidos", (): void => {
  const vacio: EstadoVista = crearEstadoVista([], "Vacío");
  const criterio: CriterioOrden<Proveedor> = { campo: "rate", direccion: "asc" };
  expect(ordenarVista(vacio, []).proveedores).toEqual([]);
  for (const metodo of ["linear", "binary"] as const) {
    const resultado: EstadoVista = buscarEnVista(vacio, criterio, 100, metodo);
    expect(resultado.busqueda).toBeNull();
    expect(resultado.resultadoJson).toBeNull();
  }
  expect(generarReporteVista(vacio).reporte?.rate).toEqual({
    total: 0,
    promedio: null,
    maximo: null,
    minimo: null,
  });
  expect(interpretarNumeroOpcional("   ")).toBeUndefined();
  expect(interpretarNumeroOpcional("0")).toBe(0);
  for (const texto of ["NaN", "Infinity", "-1", "abc"]) {
    expect((): number | undefined => interpretarNumeroOpcional(texto)).toThrow();
  }
});

test("filtros, ordenamiento y ambas búsquedas", async ({ page }: { page: Page }): Promise<void> => {
  await page.goto("/");
  await expect(page.locator("#rows tr")).toHaveCount(3);
  await page.selectOption("#filter-status", "active");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.locator("#rows tr")).toHaveCount(2);
  await page.selectOption("#sort-direction", "desc");
  await page.getByRole("button", { name: "Ordenar", exact: true }).click();
  await expect(page.locator("#rows tr").first()).toContainText("Levante");
  await page.selectOption("#search-field", "rate");
  await page.fill("#search-value", "42.5");
  for (const metodo of ["linear", "binary"]) {
    await page.selectOption("#search-method", metodo);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.locator("#search-result")).toContainText("Northstar CX Partners");
  }
  await page.fill("#search-value", "90");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.locator("#search-result")).toHaveText("Sin coincidencias");
});

test("reportes, datos vacíos, errores y restablecimiento", async ({
  page,
}: {
  page: Page;
}): Promise<void> => {
  await page.goto("/");
  await page.getByRole("button", { name: "Generar reporte" }).click();
  await expect(page.locator("#json")).toContainText('"total": 247.5');
  await expect(page.locator("#categories")).toContainText("executive_search · 1");
  await page.fill("#rate-min", "150");
  await page.fill("#rate-max", "20");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("mínima no puede superar");
  await page.fill("#rate-max", "200");
  await page.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.locator("#empty")).toBeVisible();
  await page.getByRole("button", { name: "Generar reporte" }).click();
  await expect(page.locator("#json")).toContainText('"promedio": null');
  await page.getByRole("button", { name: "Restablecer", exact: true }).click();
  await expect(page.locator("#rows tr")).toHaveCount(3);
  await expect(page.locator("#report-result")).toBeHidden();
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`presentación ${viewport.width}px sin errores de navegador`, async ({
    page,
  }: {
    page: Page;
  }): Promise<void> => {
    const errores: string[] = [];
    page.on("pageerror", (error: Error): void => {
      errores.push(error.message);
    });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#rows tr")).toHaveCount(3);
    await expect(page.locator("button svg").first()).toBeVisible();
    expect(
      await page.evaluate((): boolean => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Generar reporte" }).click();
    await page.screenshot({
      path: `test-results/proveedores-${viewport.width}.png`,
      fullPage: true,
    });
    expect(errores).toEqual([]);
  });
}
