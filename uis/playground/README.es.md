# Pruebas manuales de Nexova

Aplicación Next.js con sesión protegida y pantalla operativa Tailwind/Lucide. Las operaciones de proveedores siguen ejecutando las funciones TypeScript de `packages/shared/index.ts` con datos de prueba; la autenticación y la gestión de cuenta usan FastAPI.

## Ejecución

Desde la raíz del repositorio:

```sh
npm ci
npm run dev --workspace @repo/nexova-playground
```

Arranca también FastAPI en el puerto 8000 con `JWT_SECRET_KEY` configurado. Abre `http://localhost:3000` o el puerto 3000 reenviado de Codespaces. No sirvas esta carpeta con `http-server`: las vistas protegidas dependen de Next.js. `FASTAPI_URL` permite cambiar la dirección interna de FastAPI; el navegador usa el proxy de mismo origen `/api/backend`.

`npm run dev` compila primero los assets operativos. `npm run build` genera esos assets y la app Next.js; `npm run start` sirve la compilación de producción. Si cambias `app.ts` durante desarrollo, recompila con `npm run build:legacy`.

## Autenticación

La vista `/account/profile`, accesible desde «Mi perfil», muestra el email y los campos `name`, `phone` y `address` recibidos de `GET /auth/me`. Permite editar el perfil con `PUT /profiles/me` y `Authorization: Bearer`, muestra el resultado del guardado y requiere sesion. `/account` conserva la gestion de credenciales.

`/login`, `/register` y `/account` usan el flujo compartido con el backoffice. El registro crea el usuario y realiza login, el token se guarda en `localStorage` (`nexova.access_token`) y se adjunta mediante `Authorization: Bearer`. La vista operativa solo se monta tras validar `/auth/me`. Logout elimina el token y redirige al login; los `401` de la API hacen lo mismo. El almacenamiento es independiente por origen, por lo que cada aplicación requiere su propio login. No se aplica esta protección al website público.

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

Las pruebas cubren operaciones, sesión, registro, perfil, logout, errores, JWT inválidos y escritorio/móvil. Usan Next.js en 3001/5174 y una API FastAPI temporal en 8002 con base aislada, sin modificar `data/auth.json`. Generan capturas en `test-results/`. Compila ambas apps desde la raíz con `npm run build:uis` antes de ejecutar Playwright.

En contenedores Linux pueden faltar bibliotecas del sistema para Chromium. En ese caso, instala sus dependencias con `npx playwright install --with-deps chromium` desde tu terminal (puede requerir permisos de administrador). Esta instalación solo es necesaria para las pruebas automatizadas, no para servir la página ni usarla desde tu navegador.