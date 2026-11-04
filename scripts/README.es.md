# Carpeta `scripts`

Esta carpeta contiene **scripts auxiliares** del monorepo: automatizaciones de desarrollo, utilidades de mantenimiento, tareas repetitivas (setup, lint, migraciones, generación de datos, etc.) y tooling interno.

- **Propósito principal**: agrupar herramientas de soporte que no pertenecen a una app/agente/pipeline específico, pero facilitan el trabajo del equipo.
- **Recomendación**: documenta cada script (qué hace, parámetros, requisitos, ejemplos de uso) y procura que sean reproducibles (y seguros) en distintos entornos.

## Análisis de incidencias

`analyze.py` carga un CSV con pandas, valida sus registros y muestra las métricas por consola.

```bash
python scripts/analyze.py scripts/incidents-COMPANY.csv
```

## Carga de incidencias históricas

El CSV oficial de Nexova está en `data/raw/incidents-nexova.csv`.
Origen: [4Geeks Academy](https://github.com/4GeeksAcademy/ai-engineering-syllabus/blob/main/content/contexts/incidents-file-analysis/incidents-nexova.csv).
El analizador y el seed comparten la validación del formato histórico.

```bash
uv run python scripts/seed_incidents.py --database /tmp/nexova-incidents-check.json
```

En una base vacía, inserta 96 registros y reporta cuatro rechazos (empresa o
categoría ausente, email inválido y caso cerrado sin satisfacción). El comando
termina con código 1 si hay rechazos, aunque los registros válidos se insertan.
La segunda ejecución inserta cero y omite 96 duplicados.

El título son los primeros 120 caracteres de la descripción, recortados; la
descripción se conserva literalmente. Las fechas `YYYY-MM-DD` se guardan como
medianoche UTC; todos los registros tienen `origin="customer"` y
`branch="central"`. Estado y categoría se transforman según `BRIEFING.md`.
El UUID determinista deriva de `ticket_id` o, si falta, de `title + created_at`;
no se almacena el identificador original del CSV.

`GET /api/incidents/summary`, usando la misma base, devuelve:

```json
{
	"by_status": {"open": 27, "resolved": 56, "discarded": 13},
	"by_category": {"technical_failure": 49, "process_error": 35, "client_complaint": 12},
	"by_origin": {"customer": 96},
	"by_branch": {"central": 96}
}
```

Para cargar en la base de la aplicación, especifica `--database data/auth.json`.
No se borran ni sobrescriben registros existentes: si ya hay incidencias,
los totales incluirán también esos registros. Detén la API durante la carga;
TinyDB no admite escrituras concurrentes entre procesos.

## Carga inicial de proveedores

Desde la raiz del repositorio:

```bash
uv run seed
```

El comando lee los proveedores iniciales desde el bloque JSON de `CONTEXT.md`.
También acepta un archivo JSON externo con
`name`, `country`, `product_categories`, `rate` (positivo) y `status`
(`active` o `suspended`). No incluyas `updated_at`; lo genera el sistema en UTC.
La lista completa se valida antes de escribir en la tabla `suppliers` de TinyDB.
Antes de insertar, comprueba si ya existe un proveedor con el mismo nombre y pais;
si existe, lo omite sin sobrescribirlo. Las ejecuciones repetidas no duplican datos.
La base de datos usa `TINYDB_PATH` o, por defecto, `data/auth.json`.

Puedes cambiar los archivos sin editar codigo:

```bash
uv run seed --input ruta/proveedores.json --database ruta/base.json
```

Si falta el bloque JSON o la lista esta vacia o es invalida, el comando termina
con error y no carga proveedores.
