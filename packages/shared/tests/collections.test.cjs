const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  filtrar,
  filtrarProveedores,
  ordenar,
  buscarLineal,
  buscarLinealPorCampos,
  validarProveedor,
  validarRegistroTalento,
  buscarBinaria,
  contarPorCategoria,
  calcularTotal,
  calcularPromedio,
  calcularMaximo,
  calcularMinimo,
  generarReporteProveedores,
  exigirProveedorValido,
  exigirRegistroTalentoValido,
  crearProveedor,
} = require("../dist");

const proveedores = [
  {
    name: "Levante Executive Search",
    country: "España",
    product_categories: ["executive_search"],
    rate: 125,
    status: "active",
    updated_at: "2026-10-10T00:00:00Z",
  },
  {
    name: "Northstar CX Partners",
    country: "Estados Unidos",
    product_categories: ["customer_service_outsourcing"],
    rate: 42.5,
    status: "active",
    updated_at: "2026-10-10T00:00:00Z",
  },
  {
    name: "Lidera Formación",
    country: "España",
    product_categories: ["corporate_training"],
    rate: 80,
    status: "suspended",
    updated_at: "2026-10-10T00:00:00Z",
  },
];
const talento = {
  "Nombre completo": "Ana Ruiz",
  Email: "ana@empresa.com",
  Teléfono: "+34 612 345 678",
  "País de residencia": "España",
  "Años de experiencia": 0,
  "Sector de interés": "Tecnología",
  "Nivel de inglés": "Avanzado",
  Disponibilidad: "Inmediata",
  "Acepto política de datos": true,
};

test("filtra criterios combinados, categorías y rangos inclusivos sin mutar", () => {
  const original = structuredClone(proveedores);
  assert.deepEqual(filtrarProveedores(proveedores), proveedores);
  assert.deepEqual(
    filtrarProveedores(proveedores, {
      country: "España",
      status: "active",
      product_categories: ["executive_search"],
      rate: { min: 125, max: 125 },
    }),
    [proveedores[0]],
  );
  assert.deepEqual(filtrarProveedores(proveedores, { rate: { max: 80 } }), proveedores.slice(1));
  assert.deepEqual(filtrarProveedores(proveedores, { rate: { min: 80 } }), [
    proveedores[0],
    proveedores[2],
  ]);
  assert.deepEqual(filtrarProveedores(proveedores, { name: "Northstar" }), [proveedores[1]]);
  assert.deepEqual(
    filtrarProveedores(proveedores, {
      product_categories: ["executive_search", "corporate_training"],
    }),
    [],
  );
  assert.deepEqual(filtrarProveedores(proveedores, { rate: { min: 100, max: 20 } }), []);
  assert.deepEqual(
    filtrar(proveedores, [
      (proveedor) => proveedor.country === "España",
      (proveedor) => proveedor.rate < 100,
    ]),
    [proveedores[2]],
  );
  assert.deepEqual(proveedores, original);
});

test("ordena números, textos y múltiples campos con estabilidad y sin mutar", () => {
  const original = structuredClone(proveedores);
  assert.deepEqual(ordenar(proveedores, [{ campo: "rate", direccion: "asc" }]), [
    proveedores[1],
    proveedores[2],
    proveedores[0],
  ]);
  assert.deepEqual(ordenar(proveedores, [{ campo: "rate", direccion: "desc" }]), [
    proveedores[0],
    proveedores[2],
    proveedores[1],
  ]);
  assert.deepEqual(
    ordenar(proveedores, [
      { campo: "country", direccion: "asc" },
      { campo: "rate", direccion: "desc" },
    ]),
    [proveedores[0], proveedores[2], proveedores[1]],
  );
  assert.deepEqual(ordenar(proveedores, []), proveedores);
  const iguales = [
    { rate: 80, name: "primero" },
    { rate: 80, name: "segundo" },
  ];
  assert.deepEqual(ordenar(iguales, [{ campo: "rate", direccion: "asc" }]), iguales);
  const opcionales = [{ rate: null }, { rate: 0 }, {}, { rate: 2 }];
  assert.deepEqual(ordenar(opcionales, [{ campo: "rate", direccion: "desc" }]), [
    opcionales[3],
    opcionales[1],
    opcionales[0],
    opcionales[2],
  ]);
  assert.deepEqual(proveedores, original);
});

test("busca linealmente el primer resultado en arrays ascendentes y descendentes", () => {
  for (const direccion of ["asc", "desc"]) {
    const ordenados = ordenar(proveedores, [{ campo: "rate", direccion }]);
    assert.equal(
      buscarLineal(ordenados, (proveedor) => proveedor.rate === 80),
      proveedores[2],
    );
    assert.equal(
      buscarLinealPorCampos(ordenados, { country: "España", status: "active" }),
      proveedores[0],
    );
    assert.equal(
      buscarLinealPorCampos(ordenados, { status: "active" }),
      ordenados.find((proveedor) => proveedor.status === "active"),
    );
    assert.equal(buscarLinealPorCampos(ordenados, { name: "Ausente" }), undefined);
  }
  let visitas = 0;
  assert.equal(
    buscarLineal(proveedores, () => {
      visitas += 1;
      return true;
    }),
    proveedores[0],
  );
  assert.equal(visitas, 1);
});

test("colecciones vacías y criterios vacíos", () => {
  assert.deepEqual(filtrarProveedores([]), []);
  assert.deepEqual(ordenar([], [{ campo: "rate", direccion: "asc" }]), []);
  assert.equal(
    buscarLineal([], () => true),
    undefined,
  );
  assert.equal(buscarLinealPorCampos([], {}), undefined);
  assert.equal(buscarLinealPorCampos(proveedores, {}), proveedores[0]);
});

test("proveedores cumplen categorías, tarifa, estado y fecha UTC", () => {
  for (const proveedor of proveedores) assert.deepEqual(validarProveedor(proveedor), {});
  for (const rate of [0, -1, NaN, Infinity, "125.00"]) {
    assert.ok(validarProveedor({ ...proveedores[0], rate }).rate);
  }
  const errores = validarProveedor({
    ...proveedores[0],
    name: " ",
    country: "",
    product_categories: [],
    status: "invalid",
    updated_at: "2026-10-10T00:00:00+02:00",
  });
  assert.deepEqual(Object.keys(errores), [
    "name",
    "country",
    "product_categories",
    "status",
    "updated_at",
  ]);
  assert.ok(
    validarProveedor({ ...proveedores[0], product_categories: ["invalid"] }).product_categories,
  );
  assert.ok(validarProveedor({ ...proveedores[0], updated_at: "no es fecha" }).updated_at);
  assert.ok(validarProveedor({ ...proveedores[0], updated_at: "2026-02-30T00:00:00Z" }).updated_at);
  assert.ok(validarProveedor({ ...proveedores[0], updated_at: "2026-10-10T24:00:00Z" }).updated_at);
  assert.deepEqual(
    validarProveedor({ ...proveedores[0], updated_at: "2024-02-29T12:30:45.123+00:00" }),
    {},
  );
});

test("talento respeta límites, campos opcionales y mensajes exactos", () => {
  assert.deepEqual(validarRegistroTalento(talento), {});
  assert.deepEqual(
    validarRegistroTalento({
      ...talento,
      "Años de experiencia": 50,
      "Comentarios adicionales": "a".repeat(500),
      "LinkedIn (URL del perfil)": "https://linkedin.com/in/ana",
    }),
    {},
  );
  for (const experiencia of [-1, 51, NaN, Infinity]) {
    assert.equal(
      validarRegistroTalento({ ...talento, "Años de experiencia": experiencia })[
        "Años de experiencia"
      ],
      "Los años de experiencia deben estar entre 0 y 50",
    );
  }
  const errores = validarRegistroTalento({
    ...talento,
    "Nombre completo": "Ana",
    Email: "ana@empresa",
    Teléfono: "612345678",
    "Acepto política de datos": false,
    "Comentarios adicionales": "a".repeat(501),
    "LinkedIn (URL del perfil)": "ftp://example.com",
  });
  assert.equal(errores["Nombre completo"], "El nombre debe contener al menos nombre y apellido");
  assert.equal(errores.Email, "Ingresa un email válido (ejemplo: nombre@empresa.com)");
  assert.equal(
    errores["Teléfono"],
    "El teléfono debe incluir código de país (ejemplo: +34 612 345 678)",
  );
  assert.equal(
    errores["LinkedIn (URL del perfil)"],
    "Si incluyes LinkedIn, debe ser una URL válida",
  );
  assert.equal(
    errores["Comentarios adicionales"],
    "Los comentarios no pueden exceder 500 caracteres (quedan -1)",
  );
  assert.equal(
    errores["Acepto política de datos"],
    "Debes aceptar la política de tratamiento de datos para continuar",
  );
  assert.equal(Object.keys(validarRegistroTalento({})).length, 9);
});

test("búsqueda binaria: ambas direcciones, extremos, duplicados y ausencia", () => {
  for (const direccion of ["asc", "desc"]) {
    const criterio = { campo: "rate", direccion };
    const ordenados = ordenar(
      [...proveedores, { ...proveedores[2], name: "Duplicado" }],
      [criterio],
    );
    for (const rate of [42.5, 80, 125]) {
      assert.equal(
        buscarBinaria(ordenados, criterio, rate),
        ordenados.find((proveedor) => proveedor.rate === rate),
      );
    }
    for (const rate of [0, 60, 200])
      assert.equal(buscarBinaria(ordenados, criterio, rate), undefined);
    const texto = { campo: "name", direccion };
    assert.equal(
      buscarBinaria(ordenar(proveedores, [texto]), texto, "Lidera Formación"),
      proveedores[2],
    );
    assert.equal(buscarBinaria([], criterio, 80), undefined);
    assert.equal(buscarBinaria([proveedores[2]], criterio, 80), proveedores[2]);
  }
});

test("búsqueda binaria usa O(log n) comparaciones y conserva el array", () => {
  let accesos = 0;
  const datos = Array.from({ length: 4096 }, (_, indice) => ({
    get rate() {
      accesos += 1;
      return indice;
    },
  }));
  assert.equal(buscarBinaria(datos, { campo: "rate", direccion: "asc" }, 3000), datos[3000]);
  assert.ok(accesos <= 14);
  const original = structuredClone(proveedores);
  buscarBinaria(
    ordenar(proveedores, [{ campo: "rate", direccion: "asc" }]),
    { campo: "rate", direccion: "asc" },
    80,
  );
  assert.deepEqual(proveedores, original);
});

test("agregaciones: categorías múltiples sin doble conteo y estadísticas", () => {
  const datos = [
    ...proveedores,
    {
      ...proveedores[0],
      product_categories: ["executive_search", "corporate_training", "executive_search"],
    },
  ];
  assert.deepEqual(
    [...contarPorCategoria(datos, (proveedor) => proveedor.product_categories)],
    [
      ["executive_search", 2],
      ["customer_service_outsourcing", 1],
      ["corporate_training", 2],
    ],
  );
  const rate = (proveedor) => proveedor.rate;
  assert.equal(calcularTotal(proveedores, rate), 247.5);
  assert.equal(calcularPromedio(proveedores, rate), 82.5);
  assert.equal(calcularMaximo(proveedores, rate), 125);
  assert.equal(calcularMinimo(proveedores, rate), 42.5);
  assert.equal(
    calcularMaximo([-10, -2], (valor) => valor),
    -2,
  );
  assert.equal(
    calcularMinimo([-10, -2], (valor) => valor),
    -10,
  );
  assert.equal(calcularTotal([], rate), 0);
  for (const calcular of [calcularPromedio, calcularMaximo, calcularMinimo])
    assert.equal(calcular([], rate), null);
  assert.equal(contarPorCategoria([], (dato) => dato).size, 0);
  for (const calcular of [calcularTotal, calcularPromedio, calcularMaximo, calcularMinimo]) {
    for (const valor of [NaN, Infinity, -Infinity, "125"])
      assert.throws(() => calcular([valor], (dato) => dato), RangeError);
  }
  assert.throws(
    () => calcularTotal([Number.MAX_VALUE, Number.MAX_VALUE], (valor) => valor),
    RangeError,
  );
});

test("reportes validan antes de agregar y mantienen los nombres del contexto", () => {
  assert.deepEqual(generarReporteProveedores(proveedores), {
    total_elementos: 3,
    product_categories: {
      executive_search: 1,
      customer_service_outsourcing: 1,
      corporate_training: 1,
    },
    rate: { total: 247.5, promedio: 82.5, maximo: 125, minimo: 42.5 },
  });
  assert.deepEqual(generarReporteProveedores([]), {
    total_elementos: 0,
    product_categories: {
      executive_search: 0,
      customer_service_outsourcing: 0,
      corporate_training: 0,
    },
    rate: { total: 0, promedio: null, maximo: null, minimo: null },
  });
  assert.throws(
    () => generarReporteProveedores([proveedores[0], { ...proveedores[1], rate: -1 }]),
    /rate/,
  );
  assert.throws(() => generarReporteProveedores([null]), /name/);
});

test("validación segura de objetos externos y barreras antes del procesamiento", () => {
  for (const dato of [
    null,
    undefined,
    1,
    "texto",
    [],
    {},
    { name: 1, country: false, product_categories: null },
  ]) {
    assert.equal(Object.keys(validarProveedor(dato)).length, 6);
    assert.throws(() => exigirProveedorValido(dato));
    assert.equal(Object.keys(validarRegistroTalento(dato)).length, 9);
    assert.throws(() => exigirRegistroTalentoValido(dato));
  }
  assert.ok(
    validarProveedor({ ...proveedores[0], product_categories: new Array(1) }).product_categories,
  );
  assert.ok(validarRegistroTalento({ ...talento, "Nombre completo": 22 })["Nombre completo"]);
  assert.ok(
    validarRegistroTalento({ ...talento, "Comentarios adicionales": 22 })[
      "Comentarios adicionales"
    ],
  );
  assert.ok(
    validarRegistroTalento({ ...talento, "LinkedIn (URL del perfil)": null })[
      "LinkedIn (URL del perfil)"
    ],
  );
  assert.equal(exigirProveedorValido(proveedores[0]), proveedores[0]);
  assert.equal(exigirRegistroTalentoValido(talento), talento);
  for (const campo of [
    "País de residencia",
    "Sector de interés",
    "Nivel de inglés",
    "Disponibilidad",
  ]) {
    assert.ok(validarRegistroTalento({ ...talento, [campo]: "No permitido" })[campo]);
  }
});

test("updated_at siempre se genera en el sistema al crear proveedores", () => {
  const { updated_at, ...entrada } = proveedores[0];
  const fechaActualizacion = "2026-10-10T12:00:00.000Z";
  const original = structuredClone(entrada);
  const creado = crearProveedor(entrada, fechaActualizacion);
  assert.deepEqual(validarProveedor(creado), {});
  assert.equal(creado.updated_at, fechaActualizacion);
  assert.deepEqual(crearProveedor(entrada, fechaActualizacion), creado);
  assert.deepEqual(entrada, original);
  assert.throws(() => crearProveedor(proveedores[0], fechaActualizacion), /updated_at/);
  assert.throws(() => crearProveedor({ ...entrada, rate: 0 }, fechaActualizacion), /rate/);
  assert.throws(() => crearProveedor(entrada, "fecha inválida"), /updated_at/);
});

test("búsqueda binaria conserva nulos al final en ambas direcciones", () => {
  const datos = [{ rate: null }, { rate: 0 }, { rate: 2 }];
  for (const direccion of ["asc", "desc"]) {
    const criterio = { campo: "rate", direccion };
    const ordenados = ordenar(datos, [criterio]);
    assert.equal(buscarBinaria(ordenados, criterio, null), datos[0]);
    assert.equal(buscarBinaria(ordenados, criterio, 0), datos[1]);
  }
});

test("agregaciones genéricas sobre talento previamente validado", () => {
  const registros = [talento, { ...talento, "Años de experiencia": 50 }].map(
    exigirRegistroTalentoValido,
  );
  assert.equal(
    calcularPromedio(registros, (registro) => registro["Años de experiencia"]),
    25,
  );
  assert.deepEqual(
    [...contarPorCategoria(registros, (registro) => [registro["Sector de interés"]])],
    [["Tecnología", 2]],
  );
});

test("todas las funciones TypeScript tienen parámetros y retorno explícitos", () => {
  const ts = require("typescript");
  const fs = require("node:fs");
  const path = require("node:path");
  const archivo = path.join(__dirname, "../index.ts");
  const fuente = ts.createSourceFile(
    archivo,
    fs.readFileSync(archivo, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function comprobar(nodo) {
    if (
      ts.isFunctionDeclaration(nodo) ||
      ts.isArrowFunction(nodo) ||
      ts.isFunctionExpression(nodo)
    ) {
      const linea = fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1;
      assert.ok(nodo.type, `Falta retorno explícito en la línea ${linea}`);
      for (const parametro of nodo.parameters)
        assert.ok(parametro.type, `Falta tipo de parámetro en la línea ${linea}`);
    }
    ts.forEachChild(nodo, comprobar);
  }
  comprobar(fuente);
});

test("funciones de dominio no mutan entradas congeladas", () => {
  const datos = proveedores.map((proveedor) =>
    Object.freeze({
      ...proveedor,
      product_categories: Object.freeze([...proveedor.product_categories]),
    }),
  );
  Object.freeze(datos);
  const original = structuredClone(datos);
  const criterios = Object.freeze([Object.freeze({ campo: "rate", direccion: "asc" })]);
  const ordenados = ordenar(datos, criterios);
  assert.deepEqual(
    filtrarProveedores(datos, Object.freeze({ status: "active" })),
    datos.slice(0, 2),
  );
  assert.equal(buscarBinaria(ordenados, criterios[0], 80), datos[2]);
  assert.equal(buscarLinealPorCampos(ordenados, Object.freeze({ rate: 80 })), datos[2]);
  assert.deepEqual(generarReporteProveedores(datos), generarReporteProveedores(datos));
  assert.deepEqual(datos, original);
  assert.notEqual(ordenados, datos);
  const registro = Object.freeze({ ...talento });
  assert.deepEqual(validarRegistroTalento(registro), {});
  for (const calcular of [calcularTotal, calcularPromedio, calcularMaximo, calcularMinimo]) {
    assert.throws(() => calcular([null], (valor) => valor), RangeError);
  }
});
