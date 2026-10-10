import {
  filtrarProveedores,
  ordenar,
  buscarLinealPorCampos,
  buscarBinaria,
  generarReporteProveedores,
  exigirProveedorValido,
  type Proveedor,
  type CriterioOrden,
  type FiltrosProveedor,
  type ReporteProveedores,
} from "../../packages/shared/index";

export interface EstadoVista {
  readonly proveedores: readonly Proveedor[];
  readonly operacion: string;
  readonly busqueda: Proveedor | null | undefined;
  readonly reporte: ReporteProveedores | null;
  readonly resultadoJson: unknown;
}

export function crearEstadoVista(
  proveedores: readonly Proveedor[],
  operacion: string,
): EstadoVista {
  const proveedoresValidados: Proveedor[] = proveedores.map((proveedor: Proveedor): Proveedor =>
    exigirProveedorValido(proveedor),
  );
  return {
    proveedores: proveedoresValidados,
    operacion,
    busqueda: undefined,
    reporte: null,
    resultadoJson: proveedoresValidados,
  };
}

export function filtrarVista(
  proveedoresIniciales: readonly Proveedor[],
  filtros: FiltrosProveedor,
): EstadoVista {
  return crearEstadoVista(filtrarProveedores(proveedoresIniciales, filtros), "Filtrado aplicado");
}

export function ordenarVista(
  estado: EstadoVista,
  criterios: readonly CriterioOrden<Proveedor>[],
): EstadoVista {
  const descripcion: string = criterios
    .map(
      (criterio: CriterioOrden<Proveedor>): string =>
        `${String(criterio.campo)} ${criterio.direccion}`,
    )
    .join(", ");
  return crearEstadoVista(ordenar(estado.proveedores, criterios), `Ordenado por ${descripcion}`);
}

export function buscarEnVista(
  estado: EstadoVista,
  criterio: CriterioOrden<Proveedor>,
  valor: string | number,
  metodo: "linear" | "binary",
): EstadoVista {
  const proveedoresOrdenados: Proveedor[] = ordenar(estado.proveedores, [criterio]);
  const encontrado: Proveedor | undefined =
    metodo === "binary"
      ? buscarBinaria(proveedoresOrdenados, criterio, valor)
      : buscarLinealPorCampos(proveedoresOrdenados, { [criterio.campo]: valor });
  return {
    ...crearEstadoVista(
      proveedoresOrdenados,
      `Búsqueda ${metodo === "binary" ? "binaria" : "lineal"} · ${String(criterio.campo)} ${criterio.direccion}`,
    ),
    busqueda: encontrado ?? null,
    resultadoJson: encontrado ?? null,
  };
}

export function generarReporteVista(estado: EstadoVista): EstadoVista {
  const reporte: ReporteProveedores = generarReporteProveedores(estado.proveedores);
  return { ...estado, operacion: "Reporte generado", reporte, resultadoJson: reporte };
}

export function interpretarNumeroOpcional(texto: string): number | undefined {
  if (texto.trim() === "") return undefined;
  const numero: number = Number(texto);
  if (!Number.isFinite(numero) || numero < 0)
    throw new Error("rate debe ser un número no negativo para el filtro");
  return numero;
}
