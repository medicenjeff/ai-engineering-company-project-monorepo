# Carpeta `scripts`

Esta carpeta contiene **scripts auxiliares** del monorepo: automatizaciones de desarrollo, utilidades de mantenimiento, tareas repetitivas (setup, lint, migraciones, generación de datos, etc.) y tooling interno.

- **Propósito principal**: agrupar herramientas de soporte que no pertenecen a una app/agente/pipeline específico, pero facilitan el trabajo del equipo.
- **Recomendación**: documenta cada script (qué hace, parámetros, requisitos, ejemplos de uso) y procura que sean reproducibles (y seguros) en distintos entornos.

## Análisis de incidencias

`analyze.py` carga un CSV con pandas, valida sus registros y muestra las métricas por consola.

```bash
python scripts/analyze.py scripts/incidents-COMPANY.csv
```

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
