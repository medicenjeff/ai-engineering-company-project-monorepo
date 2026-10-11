# API de incidencias

Entry point del backend FastAPI. Los routers y la lógica de dominio viven en el paquete Python bajo `src/` para conservar una única aplicación importable.

Arranque desde la raíz del repositorio:

```bash
uvicorn services.api.main:app --reload
```

Endpoints principales:

- `POST /api/incidents/analyze`
- `GET /api/incidents/results/export`

## Restablecimiento de contrasena

- `POST /auth/forgot-password`, cuerpo `{"email":"user@example.com"}`: devuelve 200 con el mismo mensaje, exista o no el email, incluso ante cuerpos invalidos o fallos de configuracion, base de datos o correo. Los cuerpos invalidos se ignoran sin enviar correo. La consulta, generacion del token y envio se ejecutan en segundo plano mediante Resend, o SMTP con STARTTLS como alternativa; la respuesta no espera estos pasos.
- `POST /auth/reset-password`, cuerpo `{"token":"...","new_password":"new-password"}`: devuelve 200 al actualizar la contrasena con bcrypt y 400 para tokens invalidos, expirados o utilizados. La contrasena requiere al menos 8 caracteres y como maximo 72 bytes UTF-8; los errores del cuerpo devuelven 422.
- `POST /auth/change-password`, cuerpo `{"current_password":"old-password","new_password":"new-password"}`: requiere `Authorization: Bearer <token_de_sesion>`. Verifica la contrasena actual antes de actualizar con bcrypt, devuelve 200 si tiene exito, 400 si la contrasena actual es incorrecta y 401 si la sesion falta, es invalida, ha expirado o el usuario esta inactivo. Aplica los mismos limites de nueva contrasena (422) e invalida los enlaces de restablecimiento pendientes. No revoca tokens de sesion existentes.

Configura estas variables en el entorno del backend:

| Variable | Valor |
| --- | --- |
| `JWT_SECRET_KEY` | Secreto propio del servidor; la firma de restablecimiento utiliza una clave derivada distinta de la de acceso. |
| `PASSWORD_RESET_EXPIRE_MINUTES` | Opcional: 30 por defecto, rango permitido 15-60. |
| `PASSWORD_RESET_REQUESTS_PER_HOUR` | Opcional: 3 por defecto, entero positivo. Maximo por email normalizado en una ventana movil de 60 minutos. |
| `PASSWORD_RESET_URL` | URL de la pagina que recibe `?token=...` y envia la nueva contrasena a la API. Requiere HTTPS, salvo localhost. |
| `RESEND_API_KEY` | API key privada de Resend. Cuando esta configurada, el backend envia mediante `https://api.resend.com/emails`. Solo en el entorno del servidor; nunca en el frontend ni en Git. |
| `EMAIL_FROM` | Remitente de Resend, por ejemplo `Accounts <accounts@example.com>`, de un dominio verificado en Resend. Requerido con `RESEND_API_KEY`. |
| `SMTP_HOST` | Servidor SMTP. |
| `SMTP_PORT` | Opcional: 587 por defecto, con STARTTLS obligatorio. |
| `SMTP_FROM` | Direccion del remitente. |
| `SMTP_USERNAME` | Usuario SMTP, opcional si el servidor no requiere autenticacion. |
| `SMTP_PASSWORD` | Contrasena SMTP, requerida cuando se configura un usuario. |

Para usar Resend, crea una API key con permiso de envio y verifica el dominio del remitente en el proveedor. Configura `RESEND_API_KEY`, `EMAIL_FROM` y `PASSWORD_RESET_URL` en el gestor de secretos o entorno del servidor. Sin `RESEND_API_KEY`, se utiliza la configuracion SMTP; si Resend falla no se reenvia automaticamente por SMTP. Ambos transportes incluyen un correo HTML de ancho fluido, texto de 16 px, boton grande, enlace alternativo que puede partirse en varias lineas y version en texto plano.

Playground y Backoffice incluyen las rutas publicas `/forgot-password` y `/reset-password`. Configura `PASSWORD_RESET_URL` con la URL publica de `/reset-password` de la aplicacion elegida; el correo agrega el token al query string. Los formularios utilizan el proxy de mismo origen `/api/backend/auth/...`. Tras completar el restablecimiento, redirigen a `/login` con una confirmacion y eliminan la sesion local del navegador.

La ruta protegida `/account/change-password`, accesible desde la navegacion de cuenta, solicita la contrasena actual, la nueva y su confirmacion. Valida que coincidan antes de enviar `POST /auth/change-password` con el token de sesion. Al actualizar, limpia los campos y muestra una confirmacion; una contrasena actual incorrecta puede corregirse sin salir del formulario. `/login` incluye el enlace de recuperacion a `/forgot-password`.

Solo se guarda la huella del token en `password_reset_tokens`; solicitar otro enlace invalida el anterior. El uso y la invalidacion persisten tras reiniciar la API. Cualquier cambio de contrasena invalida los enlaces pendientes. Los fallos del proveedor/configuracion se registran sin revelar el email, el token ni la API key y no alteran la respuesta generica.

La expiracion es obligatoria en el JWT y se comprueba de nuevo bajo el bloqueo de consumo; en el instante de expiracion el token ya no es valido. Dos intentos concurrentes no pueden consumir el mismo token en un proceso. `RESEND_API_KEY` se obtiene exclusivamente del entorno, sin valores por defecto de credenciales. `.env` y `.env.*` estan excluidos de Git, salvo `.env.example`, que debe contener solo valores vacios o ejemplos no secretos. Los tests generan su API key temporal en memoria y la inyectan en el entorno.

## Limites y auditoria

El limite se aplica antes de buscar al usuario y afecta tambien a emails desconocidos. La tabla `password_reset_rate_limits` guarda una huella SHA-256 del email normalizado y las fechas de solicitudes aceptadas. Persiste tras reinicios y utiliza el mismo bloqueo que los tokens. Las peticiones excedidas no generan tokens ni envian correos y conservan el mismo 200 generico; no invalidan el ultimo enlace emitido. Una configuracion de limite invalida bloquea el envio y registra el fallo.

La tabla `password_reset_audit` registra eventos `request_accepted`, `request_rate_limited`, `request_invalid`, `request_failed`, `token_created`, `email_sent`, `email_failed`, `reset_succeeded`, `reset_rejected`, `reset_failed` y `reset_invalid_payload`. Cada registro contiene `timestamp` ISO 8601 UTC, `ip_address`, huella del email cuando corresponde y `user_id` si se conoce. No guarda tokens, contrasenas ni API keys. `email_sent` significa aceptado por el proveedor, no entrega confirmada. La IP es `request.client.host`; no se confia directamente en cabeceras suministradas por el cliente. Con el proxy Next actual se registra la IP del proxy: para obtener la IP original, configura un proxy de confianza que sobrescriba las cabeceras y restringe en Uvicorn `--forwarded-allow-ips` a ese proxy; nunca uses `*` con una API publica.

Los registros contienen datos personales (IP y referencia de usuario): restringe el acceso al archivo TinyDB y establece una politica de retencion segun tus requisitos. Si la base de datos no esta disponible, no es posible garantizar la persistencia de auditoria; el fallo se registra sin datos sensibles. La auditoria no es transaccional ni inmutable.

Esta implementacion usa TinyDB y un bloqueo dentro del proceso: ejecuta la API con **un solo worker**. Para multiples procesos se requiere una base de datos transaccional o un almacen compartido con operaciones atomicas para el limite. El envio en segundo plano no es una cola durable; un cierre del proceso puede interrumpirlo.
