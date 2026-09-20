# Propuesta de Arquitectura

## Visión general

Este repositorio está organizado como un monorepo orientado a la ingeniería de IA y al desarrollo de soluciones digitales para una empresa. La estructura está diseñada para separar claramente los dominios de negocio, infraestructura, paquetes reutilizables, servicios, interfaces de usuario y recursos compartidos, facilitando la escalabilidad y la colaboración entre equipos.

## Objetivos

- Centralizar el código y la infraestructura del proyecto en un único repositorio.
- Separar responsabilidades por capas: dominio, servicios, paquetes compartidos, UI e infraestructura.
- Facilitar la reutilización de componentes, tipos y utilidades entre distintos módulos.
- Soportar flujos de trabajo con agentes, skills, herramientas y MCPs para automatización y extensión del sistema.
- Mantener una base clara para crecimiento, mantenimiento y despliegue en entornos reales.

## Principios de arquitectura

1. Modularidad: cada área funcional debe tener un propósito definido y límites claros.
2. Reutilización: los tipos, utilidades y configuraciones compartidas viven en ubicaciones centralizadas.
3. Escalabilidad: la estructura permite crecer por servicios, packages y workflows sin acoplar demasiado el código.
4. Colaboración: los directorios de agents, skills, workflows y tools promueven trabajo distribuido y extensible.
5. Operabilidad: la infraestructura y la documentación están separadas del código de negocio para facilitar despliegues y mantenimiento.

## Estructura propuesta

### Directorios principales

- `agents/`: implementaciones de agentes, plantillas y pruebas relacionadas con comportamiento autónomo o asistencial.
- `docs/`: documentación aplicable al proyecto, arquitectura, guías y referencias.
- `infra/`: infraestructura como código, despliegues, configuración de entornos y recursos cloud.
- `internal/`: lógica interna del sistema no expuesta como API pública.
- `mcps/`: integraciones con Model Context Protocol (MCP) y conectores externos.
- `packages/`: bibliotecas reutilizables, utilidades compartidas y tipos comunes.
- `services/`: servicios backend o de dominio que implementan funcionalidades de negocio.
- `shared/`: recursos compartidos de mayor alcance para uso transversal.
- `skills/`: habilidades especializadas para análisis, investigación y automatización.
- `uis/`: interfaces de usuario o frontends relacionados con la solución.
- `workflows/`: orquestación de procesos, flujos y automatizaciones.
- `scripts/`: tareas de soporte, automatización de mantenimiento y utilidades operativas.

## Capa de dominio

La capa de dominio debe contener la lógica de negocio y reglas principales, con independencia de detalles de infraestructura o presentación. Se recomienda:

- Mantener modelos y tipos esenciales en `packages/shared` o módulos específicos.
- Encapsular reglas de negocio en servicios y módulos de dominio.
- Evitar acoplar la lógica central a implementaciones concretas de UI o framework.

## Capa de servicios

Los servicios deben encargarse de coordinar la lógica y las integraciones con sistemas externos, APIs o LLMs. Deben ser:

- Independientes de la capa de presentación.
- Expuestos por contratos claros y bien definidos.
- Preparados para validación, observabilidad y escalado.

## Capa de experiencia de usuario

La capa de UI debe consumir interfaces y contratos estables, sin contener reglas de negocio complejas. Su responsabilidad es:

- Presentar información relevante al usuario.
- Interactuar con servicios y workflows.
- Centralizar la experiencia del cliente y sus flujos principales.

## Capa de infraestructura

La infraestructura debe ser gestionada separadamente para permitir despliegues reproducibles y consistentes. Esto incluye:

- Configuración de entornos.
- Despliegues en nube o on-prem.
- Variables de entorno y secretos.
- Monitoreo, logs y alertas.

## Reutilización y contratos compartidos

La carpeta `packages/shared` y archivos tipo `types/index.ts` resultan clave para definir:

- Contratos de datos.
- Tipos compartidos entre servicios y UI.
- Utilidades transversales.
- Estructuras de respuesta y modelos comunes.

Esto ayuda a prevenir duplicación y a mantener consistencia en toda la plataforma.

## Integración con agentes y skills

El repositorio incluye una estructura pensada para uso con agentes, skills, workflows y MCPs. Esta arquitectura favorece:

- Automatización de tareas repetitivas.
- Extensión funcional por dominio.
- Capacidad de adaptar el sistema a distintos casuísticas y procesos.

Se recomienda mantener una separación clara entre:

- lógica de negocio, 
- herramientas de automatización,
- instrucciones y metadatos de agentes,
- y recursos de conocimiento compartido.

## Recomendaciones de implementación

- Usar convenciones consistentes de nombres y carpetas.
- Mantener la documentación actualizada en `docs/`.
- Definir estándares de calidad para pruebas en cada paquete o servicio.
- Establecer contratos explícitos entre módulos para minimizar acoplamiento.
- Usar infraestructura declarativa y reproducible.
- Priorizar simplicidad al inicio y modularidad a medida que el sistema crece.

## Roadmap sugerido

### Fase 1
- Consolidar la estructura base del monorepo.
- Definir paquetes compartidos y tipos base.
- Documentar servicios y responsabilidades.

### Fase 2
- Implementar dominios clave y servicios de integración.
- Establecer workflows y automatizaciones.
- Definir la capa de UI y su consumo de APIs.

### Fase 3
- Escalar infraestructura y observabilidad.
- Añadir más skills, agentes y conectores MCP.
- Fortalecer procesos de despliegue y gobernanza.

## Conclusión

La arquitectura propuesta busca equilibrar flexibilidad, reutilización y mantenibilidad. La organización en capas y módulos facilita el crecimiento del proyecto sin perder claridad estructural ni control operacional. Con este enfoque, el repositorio puede evolucionar de manera ordenada hacia un sistema más robusto, colaborativo y extensible.

# Documento de consideraciones arquitectónicas para el backend del ATS de Nexova

## 1. Introducción

Este documento describe cómo estructurar el backend del **ATS propio de Nexova**, con foco en:

- El **patrón arquitectónico** más adecuado (manteniendo **MVC** como requisito del proyecto).
- La **organización de módulos y dominios**.
- Las **decisiones técnicas iniciales**.
- Los **riesgos y posibles confusiones** para el equipo.

Aunque el proyecto es **netamente estudiantil**, lo vinculamos a la realidad de Nexova como consultora de RRHH y adquisición de talento, con tres líneas de negocio (headhunting, outsourcing, formación) y clientes B2B en tecnología, retail y servicios financieros. El ATS se plantea como el núcleo digital para gestionar candidatos, vacantes y procesos de selección.

---

## 2. Patrón arquitectónico elegido: MVC sobre una arquitectura en capas

### 2.1. Por qué MVC encaja con el proyecto y con Nexova

El CTO pide explícitamente que se mantenga **MVC**, y eso tiene sentido en este contexto:

- Es un **proyecto estudiantil**:  
  MVC es un patrón muy conocido, fácil de explicar y de revisar en equipo. Facilita la evaluación académica y la comprensión por parte de perfiles menos técnicos.

- Nexova trabaja con **procesos claros y repetibles** (pipeline de selección, estados de candidatos, etapas de entrevistas):  
  MVC permite representar estos procesos de forma ordenada:
  - **Model**: entidades como `Candidate`, `Job`, `Application`, `Client`.
  - **View**: respuestas API (JSON) que consumirá el frontend.
  - **Controller**: lógica que orquesta casos de uso (crear vacante, mover candidato de etapa, etc.).

- El ATS es el **sistema central** para RRHH:  
  MVC ayuda a mantener una estructura mental clara del flujo:
  - El usuario (recruiter) dispara una acción → controlador → modelo → vista (respuesta).

Aunque el frontend y el backend están separados, podemos adaptar MVC a un backend de API:

- **Model** → capa de dominio + ORM.
- **View** → serialización de datos (Pydantic / JSON).
- **Controller** → routers / endpoints + servicios.

### 2.2. Complemento: arquitectura en capas (inspirada en Clean Architecture)

Para evitar que MVC se quede “demasiado simple” y acoplado, lo combinamos con una **arquitectura en capas**:

- **Capa de dominio (Model)**  
  Entidades, reglas de negocio, interfaces de repositorios.

- **Capa de aplicación (Controller + servicios)**  
  Casos de uso: crear vacante, asignar candidato, avanzar etapa, generar reportes.

- **Capa de infraestructura**  
  Implementaciones de repositorios (DB), integraciones externas (por ejemplo, futuros ATS externos, CRMs, plataformas de formación).

- **Capa de presentación (View)**  
  Esquemas Pydantic y respuestas JSON que consumirá el frontend.

Esto mantiene el espíritu de **MVC** pero con una separación más robusta, adecuada para un ATS que podría crecer y conectarse con otros sistemas.

### 2.3. Por qué no elegir serverless como patrón principal

- Nexova tiene procesos **continuos y de larga duración** (pipelines de selección, histórico de candidatos, reporting).  
- Un ATS requiere **estado consistente**, transacciones y consultas complejas.  
- Serverless puro (solo funciones aisladas) complica la gestión de dominios ricos y la trazabilidad de procesos.

Para un proyecto estudiantil y un ATS con lógica de negocio clara, **un backend clásico en capas con MVC** es más razonable y más alineado con lo que Nexova necesitaría en un producto real.

---

## 3. Organización de módulos y dominios del proyecto

### 3.1. Estructura general del proyecto

Propuesta de estructura (adaptable a FastAPI):

```text
src/
  core/
    config.py
    db.py
    security.py
  candidates/
    models.py        # Model (dominio + ORM)
    schemas.py       # View (Pydantic)
    controllers.py   # Controller (servicios + lógica)
    routes.py        # Endpoints FastAPI
    repositories.py  # Acceso a datos
  jobs/
    models.py
    schemas.py
    controllers.py
    routes.py
    repositories.py
  applications/      # Candidaturas (candidate aplica a job)
    models.py
    schemas.py
    controllers.py
    routes.py
    repositories.py
  clients/
    models.py
    schemas.py
    controllers.py
    routes.py
    repositories.py
  users/
    models.py
    schemas.py
    controllers.py
    routes.py
    repositories.py
  shared/
    exceptions.py
    utils.py
main.py

3.2. Dominios principales del ATS de Nexova
Candidates (Candidatos)  
Representa personas que aplican a vacantes.
Nexova necesita gestionar CVs, skills, experiencia, estado en el pipeline.

Jobs (Vacantes)  
Ofertas de trabajo asociadas a clientes.
Nexova trabaja con múltiples sectores (tech, retail, finanzas), por lo que las vacantes deben ser flexibles.

Applications (Candidaturas)  
Relación entre candidato y vacante, con estados (aplicado, entrevistado, rechazado, contratado).
Es el corazón del ATS.

Clients (Empresas clientes)  
Empresas para las que Nexova recluta.
Permite multi-cliente y reporting por cliente.

Users (Usuarios internos)  
Recruiters, managers, administradores.
Control de acceso y permisos.

Esta organización por dominio refleja la realidad de Nexova: varios clientes, múltiples vacantes, muchos candidatos y procesos de selección complejos.

4. Decisiones técnicas iniciales
4.1. Framework y lenguaje
Lenguaje: Python.

Framework: FastAPI (por su rendimiento, tipado y documentación automática).

Justificación:
FastAPI encaja bien con un ATS que expone una API para un frontend separado. La documentación OpenAPI facilita la colaboración entre equipo backend y frontend.

4.2. Persistencia
ORM: SQLAlchemy.

Base de datos: PostgreSQL (o similar).

Justificación:
Un ATS requiere consultas complejas, filtros, reporting y consistencia. PostgreSQL es robusto y estándar en entornos B2B.

4.3. Patrón repositorio
Definir interfaces de repositorio en cada dominio (CandidateRepository, JobRepository, etc.).

Implementaciones concretas en la capa de infraestructura.

Justificación:
Permite cambiar la implementación (por ejemplo, de PostgreSQL a otro sistema) sin romper la lógica de negocio. Es útil incluso en un proyecto estudiantil para aprender buenas prácticas.

4.4. Autenticación y autorización
JWT para autenticación de usuarios internos (recruiters, admins).

Roles básicos (RECRUITER, ADMIN).

Justificación:
Nexova necesita controlar quién puede ver qué información (por ejemplo, datos sensibles de candidatos).

4.5. Async vs Sync
Si se usan librerías async (por ejemplo, SQLAlchemy async), se puede optar por async en los endpoints.

Si no, mantener sync para simplicidad en el contexto estudiantil.

Justificación:
El objetivo principal es aprender y estructurar bien el backend, no optimizar al máximo la concurrencia.

5. Riesgos y puntos de confusión para el equipo
5.1. Confusión entre MVC clásico y API backend
Riesgo:
Algunos miembros del equipo pueden pensar en MVC como “HTML + templates”, pero aquí la “View” es JSON.

Mitigación:
Dejar claro en el documento que:

Model = dominio + ORM.

View = esquemas Pydantic + respuestas JSON.

Controller = servicios + routers.

5.2. Routers con demasiada lógica
Riesgo:
Meter toda la lógica en los endpoints (routers) y convertirlos en “controladores gordos”.

Mitigación:
Definir servicios en controllers.py y hacer que los routers solo llamen a esos servicios.

5.3. Mezclar modelos de dominio con Pydantic
Riesgo:
Usar Pydantic como modelo de dominio y ORM a la vez, generando acoplamiento fuerte.

Mitigación:
Separar claramente:

models.py → dominio + ORM.

schemas.py → Pydantic.

5.4. Falta de convenciones
Riesgo:
Cada miembro del equipo organiza los archivos a su manera.

Mitigación:
Documentar la estructura propuesta y acordarla como estándar del proyecto.

6. Conclusión
Para el ATS de Nexova, incluso siendo un proyecto estudiantil, la combinación de:

MVC adaptado a un backend de API

Arquitectura en capas (dominio, aplicación, infraestructura, presentación)

Organización por dominios (candidates, jobs, applications, clients, users)

es la opción más coherente con:

La realidad de Nexova como consultora de RRHH B2B.

La necesidad de gestionar procesos de selección complejos.

La separación clara entre frontend y backend.

El objetivo académico de demostrar comprensión de patrones arquitectónicos.

Este documento puede servir como base para que el equipo configure el entorno y los primeros endpoints con una visión compartida y justificada.