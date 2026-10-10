import { createIcons, RotateCcw, ListFilter, ArrowDownUp, Search, ChartNoAxesColumn } from "lucide";
import {
  crearProveedor,
  type Proveedor,
  type NuevoProveedor,
  type CriterioOrden,
  type ProductCategory,
  type SupplierStatus,
  type FiltrosProveedor,
} from "../../packages/shared/index";
import {
  crearEstadoVista,
  filtrarVista,
  ordenarVista,
  buscarEnVista,
  generarReporteVista,
  interpretarNumeroOpcional,
  type EstadoVista,
} from "./operaciones";

function obtenerElemento<Elemento extends HTMLElement>(
  documento: Document,
  identificador: string,
): Elemento {
  const encontrado: HTMLElement | null = documento.getElementById(identificador);
  if (!encontrado) throw new Error(`No existe el control ${identificador}`);
  return encontrado as Elemento;
}

function leerValor(documento: Document, identificador: string): string {
  return obtenerElemento<HTMLInputElement | HTMLSelectElement>(documento, identificador).value;
}

function crearCelda(documento: Document, texto: string): HTMLTableCellElement {
  const celda: HTMLTableCellElement = documento.createElement("td");
  celda.textContent = texto;
  return celda;
}

function renderizarFilas(
  documento: Document,
  proveedores: readonly Proveedor[],
  moneda: Intl.NumberFormat,
): void {
  const filas: HTMLTableRowElement[] = proveedores.map(
    (proveedor: Proveedor): HTMLTableRowElement => {
      const fila: HTMLTableRowElement = documento.createElement("tr");
      const celdaEstado: HTMLTableCellElement = crearCelda(documento, proveedor.status);
      celdaEstado.className =
        proveedor.status === "active" ? "text-accent font-bold" : "text-amber-700 font-bold";
      fila.append(
        crearCelda(documento, proveedor.name),
        crearCelda(documento, proveedor.country),
        crearCelda(documento, proveedor.product_categories.join(", ")),
        crearCelda(documento, moneda.format(proveedor.rate)),
        celdaEstado,
        crearCelda(documento, proveedor.updated_at),
      );
      return fila;
    },
  );
  obtenerElemento(documento, "rows").replaceChildren(...filas);
  obtenerElemento(documento, "count").textContent = String(proveedores.length);
  obtenerElemento(documento, "empty").hidden = proveedores.length !== 0;
}

function crearMetrica(documento: Document, nombre: string, valor: string): HTMLDivElement {
  const bloque: HTMLDivElement = documento.createElement("div");
  const titulo: HTMLParagraphElement = documento.createElement("p");
  titulo.className = "mb-2 text-xs text-gray-500";
  titulo.textContent = nombre;
  const contenido: HTMLParagraphElement = documento.createElement("p");
  contenido.className = "text-xl font-bold";
  contenido.textContent = valor;
  bloque.append(titulo, contenido);
  return bloque;
}

function formatearImporte(cantidad: number | null, moneda: Intl.NumberFormat): string {
  return cantidad === null ? "—" : moneda.format(cantidad);
}

function renderizarReporte(
  documento: Document,
  estado: EstadoVista,
  moneda: Intl.NumberFormat,
): void {
  const reporte = estado.reporte;
  obtenerElemento(documento, "report-result").hidden = reporte === null;
  if (reporte === null) return;
  obtenerElemento(documento, "metrics").replaceChildren(
    crearMetrica(documento, "Proveedores", String(reporte.total_elementos)),
    crearMetrica(documento, "rate · Total", formatearImporte(reporte.rate.total, moneda)),
    crearMetrica(documento, "rate · Promedio", formatearImporte(reporte.rate.promedio, moneda)),
    crearMetrica(documento, "rate · Máximo", formatearImporte(reporte.rate.maximo, moneda)),
    crearMetrica(documento, "rate · Mínimo", formatearImporte(reporte.rate.minimo, moneda)),
  );
  const categorias: HTMLDivElement[] = Object.entries(reporte.product_categories).map(
    ([categoria, conteo]: [string, number]): HTMLDivElement => {
      const fila: HTMLDivElement = documento.createElement("div");
      const etiqueta: HTMLParagraphElement = documento.createElement("p");
      etiqueta.className = "mb-2 break-words text-sm";
      etiqueta.textContent = `${categoria} · ${conteo}`;
      const barra: HTMLDivElement = documento.createElement("div");
      barra.className = "h-2 bg-gray-200";
      const relleno: HTMLDivElement = documento.createElement("div");
      relleno.className = "h-2 bg-accent";
      relleno.style.width = `${reporte.total_elementos ? (conteo / reporte.total_elementos) * 100 : 0}%`;
      barra.append(relleno);
      fila.append(etiqueta, barra);
      return fila;
    },
  );
  obtenerElemento(documento, "categories").replaceChildren(...categorias);
}

function renderizarVista(
  documento: Document,
  estado: EstadoVista,
  moneda: Intl.NumberFormat,
): void {
  renderizarFilas(documento, estado.proveedores, moneda);
  renderizarReporte(documento, estado, moneda);
  obtenerElemento(documento, "operation").textContent = estado.operacion;
  obtenerElemento(documento, "json").textContent = JSON.stringify(estado.resultadoJson, null, 2);
  const resultadoBusqueda: HTMLElement = obtenerElemento(documento, "search-result");
  resultadoBusqueda.hidden = estado.busqueda === undefined;
  resultadoBusqueda.textContent = estado.busqueda
    ? `Encontrado: ${estado.busqueda.name} · ${moneda.format(estado.busqueda.rate)} · ${estado.busqueda.status}`
    : "Sin coincidencias";
}

function leerFiltros(documento: Document): FiltrosProveedor {
  const criterios: FiltrosProveedor = {};
  if (leerValor(documento, "filter-name")) criterios.name = leerValor(documento, "filter-name");
  if (leerValor(documento, "filter-country"))
    criterios.country = leerValor(documento, "filter-country");
  if (leerValor(documento, "filter-category"))
    criterios.product_categories = [leerValor(documento, "filter-category") as ProductCategory];
  if (leerValor(documento, "filter-status"))
    criterios.status = leerValor(documento, "filter-status") as SupplierStatus;
  const tarifaMinima: number | undefined = interpretarNumeroOpcional(
    leerValor(documento, "rate-min"),
  );
  const tarifaMaxima: number | undefined = interpretarNumeroOpcional(
    leerValor(documento, "rate-max"),
  );
  if (tarifaMinima !== undefined && tarifaMaxima !== undefined && tarifaMinima > tarifaMaxima) {
    throw new Error("La tarifa mínima no puede superar la máxima");
  }
  criterios.rate = {};
  if (tarifaMinima !== undefined) criterios.rate.min = tarifaMinima;
  if (tarifaMaxima !== undefined) criterios.rate.max = tarifaMaxima;
  return criterios;
}

function leerCriterioPrincipal(documento: Document): CriterioOrden<Proveedor> {
  return {
    campo: leerValor(documento, "sort-field") as CriterioOrden<Proveedor>["campo"],
    direccion: leerValor(documento, "sort-direction") as "asc" | "desc",
  };
}

function leerCriteriosOrden(documento: Document): CriterioOrden<Proveedor>[] {
  const criterios: CriterioOrden<Proveedor>[] = [leerCriterioPrincipal(documento)];
  if (leerValor(documento, "sort-secondary")) {
    criterios.push({
      campo: leerValor(documento, "sort-secondary") as CriterioOrden<Proveedor>["campo"],
      direccion: leerValor(documento, "sort-secondary-direction") as "asc" | "desc",
    });
  }
  return criterios;
}

function leerBusqueda(documento: Document, estado: EstadoVista): EstadoVista {
  const campo: CriterioOrden<Proveedor>["campo"] = leerValor(
    documento,
    "search-field",
  ) as CriterioOrden<Proveedor>["campo"];
  const textoBusqueda: string = leerValor(documento, "search-value");
  const valorBusqueda: string | number = campo === "rate" ? Number(textoBusqueda) : textoBusqueda;
  if (campo === "rate" && (!Number.isFinite(valorBusqueda) || textoBusqueda.trim() === "")) {
    throw new Error("Introduce un valor numérico para rate");
  }
  return buscarEnVista(
    estado,
    { campo, direccion: leerCriterioPrincipal(documento).direccion },
    valorBusqueda,
    leerValor(documento, "search-method") as "linear" | "binary",
  );
}

function iniciarAplicacion(
  documento: Document,
  proveedoresIniciales: readonly Proveedor[],
  moneda: Intl.NumberFormat,
): void {
  let estado: EstadoVista = crearEstadoVista(proveedoresIniciales, "Datos iniciales");
  const ejecutar: (operacion: (estadoActual: EstadoVista) => EstadoVista) => void = (
    operacion: (estadoActual: EstadoVista) => EstadoVista,
  ): void => {
    obtenerElemento(documento, "error").hidden = true;
    try {
      estado = operacion(estado);
      renderizarVista(documento, estado, moneda);
    } catch (error: unknown) {
      obtenerElemento(documento, "error").textContent =
        error instanceof Error ? error.message : "No se pudo ejecutar la operación";
      obtenerElemento(documento, "error").hidden = false;
    }
  };
  const operacionesFormulario: readonly [string, (estadoActual: EstadoVista) => EstadoVista][] = [
    [
      "filter-form",
      (_estadoActual: EstadoVista): EstadoVista =>
        filtrarVista(proveedoresIniciales, leerFiltros(documento)),
    ],
    [
      "sort-form",
      (estadoActual: EstadoVista): EstadoVista =>
        ordenarVista(estadoActual, leerCriteriosOrden(documento)),
    ],
    [
      "search-form",
      (estadoActual: EstadoVista): EstadoVista => leerBusqueda(documento, estadoActual),
    ],
  ];
  for (const [identificador, operacion] of operacionesFormulario) {
    obtenerElemento<HTMLFormElement>(documento, identificador).addEventListener(
      "submit",
      (evento: SubmitEvent): void => {
        evento.preventDefault();
        ejecutar(operacion);
      },
    );
  }
  obtenerElemento(documento, "report").addEventListener("click", (): void =>
    ejecutar(generarReporteVista),
  );
  obtenerElemento(documento, "reset").addEventListener("click", (): void => {
    for (const identificador of ["filter-form", "sort-form", "search-form"]) {
      obtenerElemento<HTMLFormElement>(documento, identificador).reset();
    }
    ejecutar((_estadoActual: EstadoVista): EstadoVista =>
      crearEstadoVista(proveedoresIniciales, "Datos restablecidos"),
    );
  });
  renderizarVista(documento, estado, moneda);
}

const datosIniciales: readonly NuevoProveedor[] = [
  {
    name: "Levante Executive Search",
    country: "España",
    product_categories: ["executive_search"],
    rate: 125,
    status: "active",
  },
  {
    name: "Northstar CX Partners",
    country: "Estados Unidos",
    product_categories: ["customer_service_outsourcing"],
    rate: 42.5,
    status: "active",
  },
  {
    name: "Lidera Formación",
    country: "España",
    product_categories: ["corporate_training"],
    rate: 80,
    status: "suspended",
  },
];
const fechaActualizacion: string = new Date().toISOString();
const proveedoresIniciales: Proveedor[] = datosIniciales.map((entrada: NuevoProveedor): Proveedor =>
  crearProveedor(entrada, fechaActualizacion),
);
createIcons({ icons: { RotateCcw, ListFilter, ArrowDownUp, Search, ChartNoAxesColumn } });
iniciarAplicacion(
  document,
  proveedoresIniciales,
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD" }),
);
