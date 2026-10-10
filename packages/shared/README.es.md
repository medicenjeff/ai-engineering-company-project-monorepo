# Tipos y consultas de Nexova

Paquete TypeScript basado en `CONTEXT.md`, sin dependencias de ejecución.

## Entidades

- `Proveedor`: `name`, `country`, `product_categories`, `rate`, `status`, `updated_at`.
- `NuevoProveedor`: los mismos campos salvo `updated_at`, que genera el sistema.
- `RegistroTalento`: conserva literalmente los nombres del formulario, incluidos espacios y acentos. Los campos opcionales son `LinkedIn (URL del perfil)` y `Comentarios adicionales`; el consentimiento válido es `true`.
- `Servicio`: las tres denominaciones de servicios especificadas en el contexto y su descripción.
- `Organization`, `PostalAddress`, `ContactPoint`: campos y valores del marcado Schema.org de Nexova.

`rate` es un número en USD por hora, no una cadena: convertir las tarifas de los datos iniciales al cargarlas. `validarProveedor` comprueba categorías, tarifa positiva, estado y fecha UTC válida. `validarRegistroTalento` devuelve errores por campo con los mensajes del contexto. Ambos reciben `unknown` y rechazan también tipos incorrectos o campos ausentes sin fallar al leerlos. Las interfaces no sustituyen la validación en tiempo de ejecución.

`exigirProveedorValido` y `exigirRegistroTalentoValido` devuelven el objeto tipado o lanzan un error con los errores por campo, para bloquear el procesamiento de datos inválidos. `crearProveedor(entrada, fechaActualizacion)` recibe `NuevoProveedor` y una fecha UTC generada por el sistema llamante. Rechaza `updated_at` si aparece en la entrada del cliente. Recibir la fecha por parámetro evita consultar el reloj dentro de la función y hace la creación determinista.

## Consultas

```typescript
import {
  filtrarProveedores, ordenar, buscarLinealPorCampos,
  type Proveedor,
} from "@repo/shared-types";

function encontrar(proveedores: readonly Proveedor[]): Proveedor | undefined {
  const seleccionados = filtrarProveedores(proveedores, {
    product_categories: ["executive_search"],
    rate: { min: 50, max: 150 },
    status: "active",
  });
  const ordenados = ordenar(seleccionados, [
    { campo: "country", direccion: "asc" },
    { campo: "rate", direccion: "desc" },
  ]);
  return buscarLinealPorCampos(ordenados, { country: "España" });
}
```

- `filtrar`: predicados genéricos para cualquier entidad; combina todos los criterios con AND.
- `filtrarProveedores`: nombre por subcadena sensible a mayúsculas, país y estado exactos, categorías que deben estar todas presentes y rango de `rate` inclusivo. Omitir criterios devuelve todos; un rango invertido devuelve ninguno.
- `ordenar`: admite campos escalares, prioridades múltiples y direcciones `asc`/`desc`. Es estable; compara textos con configuración española y deja `null`/`undefined` al final en ambas direcciones. Las listas de categorías no son campos escalares ordenables.
- `buscarLineal`: recorre el array previamente ordenado hasta la primera coincidencia con un predicado. No presupone dirección ni reordena; complejidad O(n).
- `buscarLinealPorCampos`: búsqueda lineal por igualdad estricta de uno o varios campos (AND). Sin criterios devuelve el primer elemento; sin coincidencias devuelve `undefined`.
- `buscarBinaria`: búsqueda O(log n) por un campo escalar y dirección `asc`/`desc`, con la misma comparación que `ordenar`. Devuelve la primera coincidencia o `undefined`, incluso con valores duplicados.

La búsqueda binaria requiere que el array ya esté ordenado por el campo y dirección indicados. Con ordenamiento múltiple, buscar por el primer campo; buscar por un campo secundario no garantiza el orden global requerido. No verifica ni corrige el orden, para conservar su complejidad O(log n).

```typescript
import { buscarBinaria, ordenar, type Proveedor } from "@repo/shared-types";

function buscarPorRate(proveedores: readonly Proveedor[], rate: number): Proveedor | undefined {
  const ordenados: Proveedor[] = ordenar(proveedores, [{ campo: "rate", direccion: "asc" }]);
  return buscarBinaria(ordenados, { campo: "rate", direccion: "asc" }, rate);
}
```

Ninguna operación modifica el array de entrada. Filtros y ordenamiento devuelven arrays nuevos, conservando las referencias a sus elementos. La búsqueda lineal también puede aplicarse a arrays sin ordenar; la búsqueda binaria exige el orden indicado.

## Agregaciones y reportes

- `contarPorCategoria`: recibe un selector de categorías y devuelve un `Map` de conteos. Cada elemento cuenta una sola vez por categoría, aunque su lista contenga duplicados. Sirve también para `Sector de interés` mediante un selector que devuelva una lista de un elemento.
- `calcularTotal`, `calcularPromedio`, `calcularMaximo`, `calcularMinimo`: reciben un selector numérico; rechazan valores no finitos. En arrays vacíos, el total es `0` y promedio/máximo/mínimo son `null`. El total también rechaza desbordamientos.
- `generarReporteProveedores`: exige que todos los objetos cumplan las reglas antes de agregar; no omite datos inválidos silenciosamente. Devuelve `total_elementos`, conteos de las tres `product_categories` (incluidas las de conteo cero) y estadísticas de `rate`. La suma de tarifas por hora es un agregado numérico, no facturación.

```typescript
import {
  generarReporteProveedores, exigirRegistroTalentoValido, calcularPromedio,
  type RegistroTalento, type ReporteProveedores,
} from "@repo/shared-types";

function reporte(datos: readonly unknown[]): ReporteProveedores {
  return generarReporteProveedores(datos);
}

function experienciaMedia(datos: readonly unknown[]): number | null {
  const registros: RegistroTalento[] = datos.map(
    (dato: unknown): RegistroTalento => exigirRegistroTalentoValido(dato),
  );
  return calcularPromedio(registros, (registro: RegistroTalento): number => registro["Años de experiencia"]);
}
```

Las operaciones genéricas no imponen un modelo de negocio: valida primero con las funciones `exigir...`. Cada operación tiene una responsabilidad: comparar, buscar, contar, calcular una estadística, validar o componer un reporte. Todos los parámetros y retornos de funciones TypeScript, incluidas las anónimas, están anotados explícitamente y una prueba verifica esa condición.

## Verificación

Desde `packages/shared`:

```sh
npm ci
npm run validate
```

`npm run validate` comprueba tipos, compila en modo estricto y ejecuta las pruebas con el runner de Node.js. Para comprobaciones independientes: `npm run typecheck`, `npm run build` o `npm test`. La compilación genera JavaScript CommonJS y declaraciones públicas en `dist/`.