# Carpeta `uis`

Esta carpeta contiene **todos los proyectos con interfaz de usuario** para el proyecto transversal de AI Engineering de la compañía — por ejemplo: un sitio web público, un frontend de panel de administración, una interfaz de ecommerce, portales para clientes, aplicaciones Streamlit/Gradio u otras herramientas sólo-frontend.

Los dos proyectos principales que se almacenan aquí son:

- **`website`** — la presencia web pública de la compañía.
- **`backoffice`** — la aplicación interna de administración. Es el lugar ideal para desarrollar múltiples soluciones dentro de un mismo proyecto: autenticación, gestión de personas, gestión de operaciones, comunicación interna y otras capacidades de back-office.

Organiza `uis/` por **distintas áreas de la compañía** — cada subcarpeta agrupa un ámbito diferente (por ejemplo, web pública frente a operaciones internas) e incluye su propia documentación técnica y funcional.

## Pruebas manuales TypeScript

La aplicación Next.js `playground` permite ejecutar filtros, búsquedas, ordenamiento y reportes sobre proveedores de Nexova. Usa Tailwind y las funciones reales del paquete compartido. Consulta [playground/README.es.md](./playground/README.es.md) para compilarla y arrancarla.

## AUTH-02

Inventario de rutas en ambas aplicaciones internas:

| Vista | Sesion requerida |
| --- | --- |
| `/login`, `/register` | No |
| `/` (pantalla operativa principal) | Si |
| `/account`, `/account/profile` | Si |
| Resto de rutas de la pagina catch-all, incluidas `/suppliers` y `/analysis` | Si |
| Vistas de incidencias y proveedores seleccionadas por hash en el backoffice | Si, dentro de la pantalla operativa protegida |

El guard de `Workspace.tsx` se ejecuta exclusivamente en el cliente: lee `localStorage` y valida el token mediante `GET /auth/me`. Cada ruta interna espera su propia comprobacion antes de renderizar el contenido. Sin token redirige a `/login`; un `401` elimina el token y redirige. Un fallo de red no se interpreta como un token invalido y muestra el error sin exponer la vista interna. No se usa middleware Next.js para leer `localStorage`.

Las interfaces internas `backoffice` y `playground` usan Next.js y comparten los flujos de login, registro, perfil y cierre de sesión en `packages/shared/frontend`. Guardan el JWT en `localStorage`, adjuntan Bearer a la API, validan la sesión antes de mostrar las vistas internas y redirigen al login si no hay token o recibe un `401`. Cada aplicación tiene su propio proxy de mismo origen hacia FastAPI, evitando solicitudes entre puertos privados de Codespaces. No se ha creado una app de autenticación independiente.

En este repositorio no hay actualmente un proyecto `website` público. La protección se aplica exclusivamente a las dos interfaces internas; un website público futuro debe permanecer fuera de este contenedor de sesión. Las plantillas de agentes y skills no son aplicaciones web.

- **Propósito principal**: centralizar en un único lugar todas las aplicaciones frontend que dan soporte a los casos de uso de la compañía.
- **Recomendación**: documenta en este archivo (o en sub-READMEs) las aplicaciones que vayas añadiendo, su objetivo, tecnología usada y cómo ejecutarlas.

> _These instructions are also available in [English](./README.md)._
