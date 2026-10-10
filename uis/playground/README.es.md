# Pruebas manuales de Nexova

Página HTML con Tailwind CSS e iconos Lucide. Ejecuta directamente las funciones TypeScript de `packages/shared/index.ts`, compiladas para el navegador, sin backend ni CDN.

## Ejecución

Desde la raíz del repositorio:

```sh
cd uis/playground
npm ci
npm run build
npx http-server . -p 3000 -a 0.0.0.0
```

Abre `http://localhost:3000`. En Codespaces, abre el puerto 3000 desde la pestaña Ports. También puedes servir desde la raíz con `npx http-server . -p 3000 -a 0.0.0.0` y abrir `/uis/playground/`.

Después de modificar las funciones o la interfaz, ejecuta `npm run build` y recarga el navegador. `npm run serve` sirve esta carpeta sin caché. La compilación genera `dist/app.js` y `dist/styles.css`; es necesaria antes de servir la página.

## Operaciones

- Filtrar combina nombre, país, categoría, estado y rango inclusivo de `rate` sobre los tres proveedores iniciales de `CONTEXT.md`.
- Ordenar aplica hasta dos campos sobre los resultados actuales, con dirección independiente.
- Buscar permite búsqueda lineal o binaria por igualdad exacta. Antes de buscar, ordena los resultados por el campo de búsqueda y la dirección principal seleccionada, garantizando la precondición de búsqueda binaria.
- Generar reporte cuenta categorías y calcula total, promedio, máximo y mínimo de `rate` sobre los resultados actuales. La suma de tarifas no representa facturación.
- Restablecer recupera los datos iniciales y limpia los controles, la búsqueda y el reporte.

Los objetos se validan antes de procesarse; el arranque genera una fecha UTC y la pasa a `crearProveedor` para asignar `updated_at`. Los resultados se muestran en una tabla, métricas, barras por categoría y un bloque JSON desplegable. Datos vacíos y errores tienen estados visibles. No se guardan cambios ni se hacen peticiones a la API.

## Calidad del código

`operaciones.ts` contiene funciones puras: reciben datos y devuelven estados nuevos, sin leer el DOM, consultar el reloj ni modificar entradas o variables globales. Las funciones del paquete compartido siguen el mismo criterio; los predicados y selectores proporcionados por el llamante también deben ser puros.

`app.ts` es el adaptador de efectos: lee controles, conecta eventos y renderiza el DOM recibido por parámetro. Esas tareas no pueden ser puras, porque su objetivo es actualizar la interfaz. El único estado mutable de la página es local a su inicialización, no global.

Variables y funciones usan camelCase, e interfaces PascalCase. Los nombres de campos definidos en `CONTEXT.md` conservan su forma literal (por ejemplo `product_categories`, `updated_at` y `Nombre completo`). Se usa `const` salvo cuando hay reasignación. Las pruebas incluyen entradas congeladas, arrays vacíos, resultados ausentes y valores nulos.

Desde esta carpeta, formatea o comprueba el código TypeScript trabajado y la página con:

```sh
npm run format
npm run format:check
```

Prettier aplica sangría de dos espacios y una configuración común al paquete compartido y a esta interfaz. No se añaden comentarios para describir código obvio.

## Verificación

```sh
npm run typecheck
npx playwright install chromium
npm test
```

Las pruebas de navegador cubren operaciones, datos vacíos, errores y vistas de escritorio/móvil. Usan un servidor temporal en el puerto 3001 y generan capturas en `test-results/`.

En contenedores Linux pueden faltar bibliotecas del sistema para Chromium. En ese caso, instala sus dependencias con `npx playwright install --with-deps chromium` desde tu terminal (puede requerir permisos de administrador). Esta instalación solo es necesaria para las pruebas automatizadas, no para servir la página ni usarla desde tu navegador.