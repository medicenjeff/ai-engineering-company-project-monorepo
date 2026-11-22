# Pruebas

## Preparación

Requisitos: Node.js compatible con Next.js 16 (20.9 o posterior), Python 3.14 o posterior, `uv` y npm.

Desde la raíz del repositorio:

```sh
uv sync
npm install
npm exec --workspace @repo/nexova-playground -- playwright install chromium
```

Playwright puede requerir bibliotecas del sistema en Linux. Si Chromium no inicia, ejecuta `npm exec --workspace @repo/nexova-playground -- playwright install --with-deps chromium` desde una terminal con los permisos necesarios.

## Comandos

Suite Python completa:

```sh
uv run pytest -q
```

Suites Python dirigidas:

```sh
uv run pytest tests/test_users_api.py -q
uv run pytest tests/test_incidents_api.py -q
uv run pytest tests/test_suppliers_api.py tests/test_supplier_model.py -q
uv run pytest tests/test_seed.py tests/test_scripts.py -q
uv run pytest packages/shared/python/tests -q
```

Cobertura de los dos grupos de endpoints usados por el backoffice:

```sh
uv run pytest --cov=ai_engineering_company_project_monorepo.api.incidents --cov=ai_engineering_company_project_monorepo.api.suppliers --cov-report=term-missing -q tests/test_incidents_api.py tests/test_suppliers_api.py
```

Los últimos resultados son **99%** para incidencias, **100%** para proveedores y **99,21%** combinado.

Tipos y pruebas de las utilidades TypeScript compartidas:

```sh
npm run validate --workspace @repo/shared-types
```

Tests Jest de los helpers frontend de auth (o `jest --coverage` desde la raíz):

```sh
npm run test:auth-utils
```

La suite Jest verifica `getJwtSubject`, `isWithinBcryptLimit` y `getAccessToken`. Resultado actual: **17 tests aprobados**, **100%** de statements, branches, functions y lines en `auth-utils.ts`.

Build de backoffice y playground:

```sh
npm run build:uis
```

Suite E2E completa (compila las UIs y luego ejecuta Playwright):

```sh
npm run test --workspace @repo/nexova-playground
```

Solo el proyecto del playground o el del backoffice:

```sh
npm exec --workspace @repo/nexova-playground -- playwright test --project playground --workers 1
npm exec --workspace @repo/nexova-playground -- playwright test --project backoffice --workers 1
```

Para ejecutar solo auth, incidencias y métricas del backoffice:

```sh
npm exec --workspace @repo/nexova-playground -- playwright test auth.spec.ts auth.incidents.spec.ts auth.summary.spec.ts --project backoffice --workers 1
```

La configuración de Playwright inicia Next en los puertos 3001 y 5174 y FastAPI en 8002. La API de pruebas usa una clave JWT fija de prueba y una base TinyDB temporal; no modifica `data/auth.json`. Ejecuta primero `npm run build:uis` si vas a lanzar Playwright directamente, ya que el servidor de pruebas usa `next start`.

## Cobertura

| Suite | Cobertura principal |
| --- | --- |
| `tests/test_users_api.py`, `tests/test_register.py`, `tests/test_login.py`, `tests/test_token.py`, `tests/test_forgot_password.py`, `tests/test_reset_password.py`, `tests/test_change_password.py` | Registro y hash de contraseñas; login y tokens; permisos y perfil; cambio/restablecimiento; uso único, expiración, límites y concurrencia; respuestas opacas de recuperación; fallos SMTP/Resend y ausencia de secretos. Los módulos pequeños agrupan camino feliz, límite y fallo por endpoint; el módulo original conserva pruebas de integración y regresión. |
| `tests/test_incidents_api.py` | Validación y CRUD de incidencias; transiciones de estado; filtros; análisis y exportación CSV; códigos 400/404/422/500 y respuestas sin traceback ni rutas privadas. |
| `tests/test_suppliers_api.py`, `tests/test_supplier_model.py` | Validación del modelo y API, filtros, tarifas, estados, eliminación, entradas inválidas y recursos inexistentes. |
| `tests/test_seed.py` | Transformación e idempotencia del seed; consistencia del CSV oficial con el analizador; validación antes de escribir; rechazo de filas inválidas. |
| `tests/test_scripts.py` | CLI con archivos ausentes, CSV vacío/malformado, fallos de exportación, estructura inválida y códigos de salida; comprueba mensajes en `stderr` sin traceback ni datos privados. |
| `packages/shared/python/tests/test_validation.py` | Reglas de validación compartidas entre el analizador y el seed para los esquemas históricos y anteriores. |
| `packages/shared/frontend/auth-utils.test.ts` (Jest) | Extracción del `sub` de JWTs bien/malformados, límite de 72 bytes UTF-8 y aceptación/rechazo de access tokens. |
| `packages/shared/tests/collections.test.cjs` | Filtros, orden estable, búsquedas lineal/binaria, colecciones vacías, agregaciones, validación, no mutación y seguridad de objetos externos. |
| `uis/playground/tests/playground.spec.ts` | Interacción con operaciones y formularios de la UI heredada: filtros, orden, búsquedas, reportes, datos vacíos, errores y layouts. |
| `uis/playground/tests/auth.spec.ts` | Registro/login, permisos y token, sesión y perfil, recuperación de contraseña, errores HTTP/red, respuestas inesperadas y layouts móvil/escritorio. |
| `uis/playground/tests/auth.incidents.spec.ts` | Registro y validación de incidencias, filtros, estados de carga/vacío/error, reintentos, actualización optimista y rollback. |
| `uis/playground/tests/auth.summary.spec.ts` | Métricas, carga lenta, errores de API/datos, reintentos, casos vacíos y layouts adaptable. |
| `uis/playground/tests/auth.integration.spec.ts` | Recorrido de sesión y perfil contra FastAPI real a través del proxy Next. |

## Matriz de casos por endpoint

Esta matriz define los casos que debe cubrir la suite de endpoints. Las pruebas priorizan decisiones y efectos de negocio (acceso concedido/denegado, registros creados o preservados, transiciones y efectos secundarios). Los status se comprueban solo cuando representan una decisión de la aplicación; no se prueban serializadores ni internos del framework.

| Endpoint | Camino feliz | Límites | Fallos |
| --- | --- | --- | --- |
| `POST /auth/login` | Credenciales válidas devuelven token y expiración. | Email normalizado; usuario inactivo. | Credenciales inválidas `401`; body inválido `422`; configuración JWT ausente/incorrecta `500` genérico. |
| `GET /auth/me` | Token vigente devuelve cuenta y perfil opcional. | Cuenta válida sin perfil. | Sin token, token malformado/expirado o usuario inactivo `401`; nunca exponer claims o secreto. |
| `POST /auth/forgot-password` | Email existente y desconocido reciben la misma respuesta `200`. | Rate limit y email con mayúsculas/espacios. | JSON/body inválido conserva respuesta opaca; fallos de auditoría o correo no alteran la respuesta ni filtran email/token/credenciales. |
| `POST /auth/reset-password` | Token vigente se consume una vez y cambia la contraseña. | Expiración en el límite; token ya consumido. | Token inválido/expirado `400`; body inválido `422`; configuración interna `500` estructurado sin secretos. |
| `POST /auth/change-password` | Contraseña actual válida actualiza credencial e invalida reset tokens. | Límites de longitud y contraseña nueva válida. | Contraseña actual errónea `400`; sesión ausente/inválida `401`; body inválido `422`. |
| `POST /api/incidents/analyze` | CSV válido devuelve métricas esperadas. | CSV oficial, columnas ausentes y conjunto vacío. | CSV vacío/malformado `400`; fallo al leer el upload `500`; mensaje sin ruta/traceback. |
| `GET /api/incidents/results/export` | Tras analizar, devuelve CSV y headers de descarga. | Exportación con valores/categorías vacíos. | Sin análisis previo `404`; error de serialización `500` genérico. |
| `POST /api/incidents` | Incidencia válida devuelve `201` e ID. | Cada categoría/sede válida y límites de campos. | Campos ausentes, extra o enum desconocido `422`; error interno `500` sin traceback. |
| `GET /api/incidents/summary` | Conteos por estado, categoría, origen y sede. | Base sin registros y dimensiones vacías. | Error de almacenamiento/cálculo `500` con envelope genérico, sin rutas ni datos de filas. |
| `GET /api/incidents` | Lista completa y filtros combinados. | Resultado vacío; filtros válidos individualmente. | Enum de filtro inválido `422`; fallo interno `500` limpio. |
| `GET /api/incidents/{id}` | ID existente devuelve detalle. | IDs con formato válido pero inexistentes. | No encontrado `404`; registros corruptos no deben filtrar traceback (`500`). |
| `PATCH /api/incidents/{id}/status` | Transiciones permitidas actualizan estado. | Estado repetido, final o transición no permitida. | ID inexistente `404`; transición inválida `400`; body/estado inválido `422`. |
| `GET /profiles/me` | Usuario autenticado obtiene su perfil. | Campos opcionales vacíos o nulos según contrato. | Sin sesión `401`; perfil inexistente `404`; error interno `500` estructurado. |
| `PUT /profiles/me` | Actualiza solo el perfil del usuario autenticado. | Actualización parcial y campos opcionales nulos. | Sin sesión `401`; datos no válidos/campos extra `422`; perfil ausente `404`. |
| `POST /users` | Registro devuelve `201`, usuario y perfil enlazados, contraseña hasheada. | Perfil opcional; entradas de contacto opcionales. | Email duplicado `409`; body inválido `422`; fallo al crear perfil revierte usuario y devuelve `500` limpio. |
| `GET /users` | Admin obtiene la lista. | Lista vacía. | Sin autenticación `401`; usuario no admin `403`; fallo interno `500` sin datos de usuarios. |
| `GET /users/{id}` | Propietario o admin obtiene usuario permitido. | Usuario inexistente. | Sin sesión `401`; recurso de otro usuario `403`; ID no encontrado `404`. |
| `PUT /users/{id}` | Propietario actualiza sus datos; admin actualiza rol permitido. | Campos opcionales omitidos y actualización parcial. | Email duplicado `409`; rol prohibido `403`; payload inválido `422`; usuario ausente `404`. |
| `DELETE /users/{id}` | Usuario permitido se elimina junto con su perfil. | Eliminar recurso ya ausente. | Sin sesión `401`; no autorizado `403`; no encontrado `404`; fallo de almacenamiento `500` limpio. |
| `POST /suppliers` | Proveedor válido se crea con `201`. | Múltiples categorías y tarifa positiva decimal. | Campos ausentes/extra, tarifa no positiva o enum inválido `422`; fallo interno `500`. |
| `GET /suppliers` | Lista proveedores y aplica filtros válidos. | Sin resultados y filtros combinados. | Categoría inválida `422`; fallo de almacenamiento `500`. |
| `GET /suppliers/{id}` | ID existente devuelve proveedor. | ID válido sin registro. | No encontrado `404`; ID de formato incorrecto `422`. |
| `PATCH /suppliers/{id}/rate` | Tarifa positiva actualiza proveedor. | Decimales y mínimo positivo. | Tarifa inválida `422`; proveedor ausente `404`; error de persistencia `500`. |
| `PATCH /suppliers/{id}/status` | Cambia entre estados admitidos. | Repetir estado actual. | Estado desconocido `422`; proveedor ausente `404`; error interno `500`. |
| `DELETE /suppliers/{id}` | Elimina proveedor y devuelve `204`. | Repetir eliminación. | Proveedor inexistente `404`; error de persistencia `500` estructurado. |

## Selección de casos

Se incluyen entradas válidas y límites, además de entradas ausentes, malformadas o fuera de rango, porque permiten distinguir errores de validación de fallos internos. En auth, una revisión asistida por IA identificó tres casos que podían faltar: hash almacenado corrupto (no debe autenticar), caída de auditoría (no debe bloquear el correo de reset) y fallo de configuración al consumir un reset (no debe cambiar contraseña ni consumir el token). Los tests de reset, concurrencia, uso único y rate limit cubren riesgos de seguridad y consistencia que no detecta una prueba feliz. Los casos de HTTP, red y JSON inválido verifican que la UI conserve contexto, muestre una salida recuperable y limpie la carga. Los fallos de I/O y de scripts comprueban `stderr`, ausencia de datos internos y salida distinta de cero. Las pruebas usan bases temporales y fixtures aislados para no depender de datos persistentes del desarrollador.

## Artefactos y notas

Playwright guarda capturas y contexto de fallos bajo `uis/playground/test-results/`. Un build puede mostrar un aviso de seguridad de Next.js y pedir que se repita el comando; sigue el aviso y revisa la actualización de la versión afectada antes de desplegar.
