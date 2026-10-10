# Pulse Desk

Aplicación Next.js para analizar incidencias y gestionar proveedores. Conserva la pantalla operativa existente dentro de una vista que solo se monta después de validar la sesión.

## Ejecución

Desde la raíz del repositorio:

```bash
npm ci
source .venv/bin/activate
uvicorn --app-dir src ai_engineering_company_project_monorepo.api.main:app --host 0.0.0.0 --port 8000
```

Configura `JWT_SECRET_KEY` en el entorno de FastAPI usando un secreto propio; no uses claves de las pruebas. En otra terminal:

```bash
npm run dev --workspace @repo/nexova-backoffice
```

Abre `http://localhost:5173`, o el puerto 5173 reenviado de Codespaces. No uses un servidor HTML estático ni la antigua ruta `/backoffice/` de FastAPI: omitirían el flujo Next.js. La API queda detrás del proxy de mismo origen `/api/backend`; el puerto 8000 puede permanecer privado. Si FastAPI está en otro host, configura `FASTAPI_URL` en el proceso Next.js.

## Sesión

- `/login`: obtiene el JWT de `POST /auth/login`.
- `/register`: crea el usuario con `POST /users`, incluyendo nombre, telefono y direccion opcionales si se completan, y realiza login con las mismas credenciales. Los errores de validacion se muestran junto a cada campo; si el registro falla, no se solicita un token.
- `/account`: consulta `GET /auth/me` y permite editar perfil, email y contraseña.
- `/account/profile`: muestra el email de solo lectura y los campos `name`, `phone` y `address` de `GET /auth/me`; guarda los cambios con `PUT /profiles/me` y Bearer. Se accede desde «Mi perfil» y requiere sesion.
- Todas las vistas operativas requieren una sesión validada por la API. Un JWT inválido o expirado devuelve al login.
- El token se almacena en `localStorage` como `nexova.access_token` y se adjunta como `Authorization: Bearer` a las llamadas de la interfaz.
- Cerrar sesión elimina el token, oculta las vistas internas y redirige al login. El cierre también se sincroniza entre pestañas del mismo origen.

Las apps en distintos puertos tienen `localStorage` independientes; cada una requiere iniciar sesión. No hay una aplicación de autenticación separada. La protección de datos sigue correspondiendo a los endpoints del servidor; la protección cliente no sustituye la autorización JWT de la API.

## Verificación

```bash
npm run build:uis
npm exec --workspace @repo/nexova-playground -- playwright test
```

La página incluye selector de fichero y drag & drop. El CSV se envía como `multipart/form-data` en el campo `file`.
