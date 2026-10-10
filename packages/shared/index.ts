export * from "./types";
import type {
  NuevoProveedor,
  ProductCategory,
  Proveedor,
  RegistroTalento,
  SupplierStatus,
} from "./types";

export type Predicado<T> = (elemento: T) => boolean;

export function filtrar<T>(elementos: readonly T[], criterios: readonly Predicado<T>[] = []): T[] {
  return elementos.filter((elemento: T): boolean =>
    criterios.every((criterio: Predicado<T>): boolean => criterio(elemento)),
  );
}

export interface FiltrosProveedor {
  name?: string;
  country?: string;
  product_categories?: readonly ProductCategory[];
  rate?: { min?: number; max?: number };
  status?: SupplierStatus;
}

export function filtrarProveedores(
  proveedores: readonly Proveedor[],
  criterios: FiltrosProveedor = {},
): Proveedor[] {
  return filtrar(proveedores, [
    (proveedor: Proveedor): boolean =>
      criterios.name === undefined || proveedor.name.includes(criterios.name),
    (proveedor: Proveedor): boolean =>
      criterios.country === undefined || proveedor.country === criterios.country,
    (proveedor: Proveedor): boolean =>
      criterios.product_categories === undefined ||
      criterios.product_categories.every((categoria: ProductCategory): boolean =>
        proveedor.product_categories.includes(categoria),
      ),
    (proveedor: Proveedor): boolean =>
      criterios.rate?.min === undefined || proveedor.rate >= criterios.rate.min,
    (proveedor: Proveedor): boolean =>
      criterios.rate?.max === undefined || proveedor.rate <= criterios.rate.max,
    (proveedor: Proveedor): boolean =>
      criterios.status === undefined || proveedor.status === criterios.status,
  ]);
}

export type ValorOrdenable = string | number | boolean | null | undefined;
export interface CriterioOrden<T> {
  campo: { [Campo in keyof T]-?: T[Campo] extends ValorOrdenable ? Campo : never }[keyof T];
  direccion: "asc" | "desc";
}

function comparar(izquierda: ValorOrdenable, derecha: ValorOrdenable): number {
  if (izquierda === derecha) return 0;
  if (izquierda == null) return derecha == null ? 0 : 1;
  if (derecha == null) return -1;
  if (typeof izquierda === "string" && typeof derecha === "string") {
    return izquierda.localeCompare(derecha, "es");
  }
  return izquierda < derecha ? -1 : izquierda > derecha ? 1 : 0;
}

function compararEnDireccion(
  izquierda: ValorOrdenable,
  derecha: ValorOrdenable,
  direccion: "asc" | "desc",
): number {
  const resultado: number = comparar(izquierda, derecha);
  if (izquierda == null || derecha == null) return resultado;
  return direccion === "asc" ? resultado : -resultado;
}

export function ordenar<T>(elementos: readonly T[], criterios: readonly CriterioOrden<T>[]): T[] {
  return [...elementos].sort((izquierda: T, derecha: T): number => {
    for (const criterio of criterios) {
      const valorIzquierdo = izquierda[criterio.campo] as ValorOrdenable;
      const valorDerecho = derecha[criterio.campo] as ValorOrdenable;
      const resultado: number = compararEnDireccion(
        valorIzquierdo,
        valorDerecho,
        criterio.direccion,
      );
      if (resultado !== 0) return resultado;
    }
    return 0;
  });
}

export function buscarLineal<T>(
  elementosOrdenados: readonly T[],
  criterio: Predicado<T>,
): T | undefined {
  for (const elemento of elementosOrdenados) {
    if (criterio(elemento)) return elemento;
  }
  return undefined;
}

export function buscarLinealPorCampos<T>(
  elementosOrdenados: readonly T[],
  criterios: Partial<T>,
): T | undefined {
  const campos = Object.keys(criterios) as (keyof T)[];
  return buscarLineal(elementosOrdenados, (elemento: T): boolean =>
    campos.every((campo: keyof T): boolean => elemento[campo] === criterios[campo]),
  );
}

export function buscarBinaria<T>(
  elementosOrdenados: readonly T[],
  criterio: CriterioOrden<T>,
  valor: T[CriterioOrden<T>["campo"]],
): T | undefined {
  let inicio: number = 0;
  let fin: number = elementosOrdenados.length;
  while (inicio < fin) {
    const medio: number = inicio + Math.floor((fin - inicio) / 2);
    const elemento: T = elementosOrdenados[medio]!;
    const resultado: number = compararEnDireccion(
      elemento[criterio.campo] as ValorOrdenable,
      valor as ValorOrdenable,
      criterio.direccion,
    );
    if (resultado < 0) inicio = medio + 1;
    else fin = medio;
  }
  const encontrado: T | undefined = elementosOrdenados[inicio];
  if (inicio >= elementosOrdenados.length) return undefined;
  return comparar(encontrado![criterio.campo] as ValorOrdenable, valor as ValorOrdenable) === 0
    ? encontrado
    : undefined;
}

export function contarPorCategoria<T, Categoria extends string>(
  elementos: readonly T[],
  seleccionar: (elemento: T) => readonly Categoria[],
): Map<Categoria, number> {
  const conteos: Map<Categoria, number> = new Map<Categoria, number>();
  for (const elemento of elementos) {
    for (const categoria of new Set<Categoria>(seleccionar(elemento))) {
      conteos.set(categoria, (conteos.get(categoria) ?? 0) + 1);
    }
  }
  return conteos;
}

function exigirNumeroFinito(valor: number): number {
  if (!Number.isFinite(valor)) throw new RangeError("El valor agregado debe ser un número finito");
  return valor;
}

export function calcularTotal<T>(
  elementos: readonly T[],
  seleccionar: (elemento: T) => number,
): number {
  let total: number = 0;
  for (const elemento of elementos)
    total = exigirNumeroFinito(total + exigirNumeroFinito(seleccionar(elemento)));
  return total;
}

export function calcularPromedio<T>(
  elementos: readonly T[],
  seleccionar: (elemento: T) => number,
): number | null {
  return elementos.length === 0 ? null : calcularTotal(elementos, seleccionar) / elementos.length;
}

export function calcularMaximo<T>(
  elementos: readonly T[],
  seleccionar: (elemento: T) => number,
): number | null {
  let maximo: number | null = null;
  for (const elemento of elementos) {
    const valor: number = exigirNumeroFinito(seleccionar(elemento));
    maximo = maximo === null ? valor : Math.max(maximo, valor);
  }
  return maximo;
}

export function calcularMinimo<T>(
  elementos: readonly T[],
  seleccionar: (elemento: T) => number,
): number | null {
  let minimo: number | null = null;
  for (const elemento of elementos) {
    const valor: number = exigirNumeroFinito(seleccionar(elemento));
    minimo = minimo === null ? valor : Math.min(minimo, valor);
  }
  return minimo;
}

export interface ReporteProveedores {
  total_elementos: number;
  product_categories: Record<ProductCategory, number>;
  rate: { total: number; promedio: number | null; maximo: number | null; minimo: number | null };
}

export function generarReporteProveedores(datos: readonly unknown[]): ReporteProveedores {
  const proveedores: Proveedor[] = datos.map((dato: unknown): Proveedor =>
    exigirProveedorValido(dato),
  );
  const conteos: Map<ProductCategory, number> = contarPorCategoria(
    proveedores,
    (proveedor: Proveedor): readonly ProductCategory[] => proveedor.product_categories,
  );
  const seleccionarRate: (proveedor: Proveedor) => number = (proveedor: Proveedor): number =>
    proveedor.rate;
  return {
    total_elementos: proveedores.length,
    product_categories: {
      executive_search: conteos.get("executive_search") ?? 0,
      customer_service_outsourcing: conteos.get("customer_service_outsourcing") ?? 0,
      corporate_training: conteos.get("corporate_training") ?? 0,
    },
    rate: {
      total: calcularTotal(proveedores, seleccionarRate),
      promedio: calcularPromedio(proveedores, seleccionarRate),
      maximo: calcularMaximo(proveedores, seleccionarRate),
      minimo: calcularMinimo(proveedores, seleccionarRate),
    },
  };
}

export type ErroresValidacion<T> = Partial<Record<keyof T, string>>;
export type EntradaTalento = Partial<Omit<RegistroTalento, "Acepto política de datos">> & {
  "Acepto política de datos"?: boolean;
};

function obtenerCampos(datos: unknown): Record<string, unknown> {
  return typeof datos === "object" && datos !== null && !Array.isArray(datos)
    ? (datos as Record<string, unknown>)
    : {};
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string";
}

function esOpcion(valor: unknown, opciones: readonly string[]): boolean {
  return esTexto(valor) && opciones.includes(valor);
}

function esUrlHttp(valor: unknown): boolean {
  if (!esTexto(valor) || !/^https?:\/\//.test(valor)) return false;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

function esFechaUtc(valor: unknown): boolean {
  return (
    esTexto(valor) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/.test(valor) &&
    Number.isFinite(Date.parse(valor)) &&
    new Date(valor).toISOString().slice(0, 19) === valor.slice(0, 19)
  );
}

export function validarRegistroTalento(entrada: unknown): ErroresValidacion<RegistroTalento> {
  const datos: Record<string, unknown> = obtenerCampos(entrada);
  const errores: ErroresValidacion<RegistroTalento> = {};
  if (
    !esTexto(datos["Nombre completo"]) ||
    datos["Nombre completo"].trim().split(/\s+/).length < 2
  ) {
    errores["Nombre completo"] = "El nombre debe contener al menos nombre y apellido";
  }
  if (!esTexto(datos.Email) || !/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(datos.Email)) {
    errores.Email = "Ingresa un email válido (ejemplo: nombre@empresa.com)";
  }
  if (!esTexto(datos["Teléfono"]) || !/^\+[1-9]\d{0,2} \d+(?: \d+)*$/.test(datos["Teléfono"])) {
    errores["Teléfono"] = "El teléfono debe incluir código de país (ejemplo: +34 612 345 678)";
  }
  if (!esOpcion(datos["País de residencia"], ["España", "Estados Unidos", "Otro"])) {
    errores["País de residencia"] = "Selecciona tu país de residencia";
  }
  const experiencia = datos["Años de experiencia"];
  if (
    typeof experiencia !== "number" ||
    !Number.isFinite(experiencia) ||
    experiencia < 0 ||
    experiencia > 50
  ) {
    errores["Años de experiencia"] = "Los años de experiencia deben estar entre 0 y 50";
  }
  if (
    !esOpcion(datos["Sector de interés"], [
      "Tecnología",
      "Retail",
      "Servicios Financieros",
      "Consultoría",
      "Otro",
    ])
  ) {
    errores["Sector de interés"] = "Selecciona el sector de tu interés";
  }
  if (!esOpcion(datos["Nivel de inglés"], ["Básico", "Intermedio", "Avanzado", "Nativo"])) {
    errores["Nivel de inglés"] = "Indica tu nivel de inglés";
  }
  if (!esOpcion(datos.Disponibilidad, ["Inmediata", "1 mes", "2-3 meses", "Solo explorando"])) {
    errores.Disponibilidad = "Selecciona tu disponibilidad";
  }
  const linkedin = datos["LinkedIn (URL del perfil)"];
  if (linkedin !== undefined && linkedin !== "" && !esUrlHttp(linkedin)) {
    errores["LinkedIn (URL del perfil)"] = "Si incluyes LinkedIn, debe ser una URL válida";
  }
  const comentarios: unknown = datos["Comentarios adicionales"];
  const longitud: number = esTexto(comentarios) ? comentarios.length : 0;
  if (comentarios !== undefined && !esTexto(comentarios)) {
    errores["Comentarios adicionales"] = "Los comentarios adicionales deben ser texto";
  }
  if (longitud > 500) {
    errores["Comentarios adicionales"] =
      `Los comentarios no pueden exceder 500 caracteres (quedan ${500 - longitud})`;
  }
  if (datos["Acepto política de datos"] !== true) {
    errores["Acepto política de datos"] =
      "Debes aceptar la política de tratamiento de datos para continuar";
  }
  return errores;
}

export function validarProveedor(entrada: unknown): ErroresValidacion<Proveedor> {
  const datos: Record<string, unknown> = obtenerCampos(entrada);
  const errores: ErroresValidacion<Proveedor> = {};
  if (!esTexto(datos.name) || !datos.name.trim()) errores.name = "name es obligatorio";
  if (!esTexto(datos.country) || !datos.country.trim()) errores.country = "country es obligatorio";
  const categorias: readonly string[] = [
    "executive_search",
    "customer_service_outsourcing",
    "corporate_training",
  ];
  if (
    !Array.isArray(datos.product_categories) ||
    !datos.product_categories.length ||
    Array.from(datos.product_categories).some(
      (categoria: unknown): boolean => !esOpcion(categoria, categorias),
    )
  ) {
    errores.product_categories =
      "product_categories debe ser una lista no vacía de categorías válidas";
  }
  if (typeof datos.rate !== "number" || !Number.isFinite(datos.rate) || datos.rate <= 0)
    errores.rate = "rate debe ser un número estrictamente positivo";
  if (!esOpcion(datos.status, ["active", "suspended"]))
    errores.status = "status debe ser active o suspended";
  if (!esFechaUtc(datos.updated_at)) {
    errores.updated_at = "updated_at debe estar en formato ISO 8601 UTC";
  }
  return errores;
}

export function exigirProveedorValido(datos: unknown): Proveedor {
  const errores: ErroresValidacion<Proveedor> = validarProveedor(datos);
  if (Object.keys(errores).length > 0) throw new Error(JSON.stringify(errores));
  return datos as Proveedor;
}

export function exigirRegistroTalentoValido(datos: unknown): RegistroTalento {
  const errores: ErroresValidacion<RegistroTalento> = validarRegistroTalento(datos);
  if (Object.keys(errores).length > 0) throw new Error(JSON.stringify(errores));
  return datos as RegistroTalento;
}

export function crearProveedor(entrada: NuevoProveedor, fechaActualizacion: string): Proveedor {
  if ("updated_at" in entrada)
    throw new Error("updated_at la genera el sistema; no la envía el cliente");
  return exigirProveedorValido({ ...entrada, updated_at: fechaActualizacion });
}
