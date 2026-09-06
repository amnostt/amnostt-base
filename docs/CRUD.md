# CRUD de referencia

La aplicación base utiliza tareas para demostrar un CRUD completo sin introducir reglas de un dominio de negocio específico. Las convenciones generales se reutilizarán en futuros módulos.

Este documento define el contrato: las formas de respuesta, los errores, las consultas y las reglas de permisos son obligatorias para todos los recursos, no solo para tareas.

## Principio general

Ante una solicitud que no se puede satisfacer tal como fue expresada, la API responde con un error explícito. Nunca sustituye, recorta ni descarta en silencio lo que el cliente pidió. Una respuesta exitosa significa que se ejecutó exactamente lo solicitado.

## Tarea

Una tarea contiene:

- Título obligatorio.
- Descripción opcional.
- Estado: `pending`, `in_progress` o `completed`.
- Fecha límite opcional.
- Usuario propietario.
- Fechas de creación y actualización.

### Validaciones

- El título se normaliza eliminando espacios externos y debe tener entre 1 y 120 caracteres.
- La descripción puede tener hasta 2.000 caracteres.
- El estado debe ser uno de los tres valores definidos.
- La fecha límite debe ser válida, pero puede estar en el pasado.

### Creación y estados

- Una tarea nueva pertenece al usuario autenticado, salvo que se indique otro propietario con el permiso correspondiente.
- Si no se especifica un estado, se utiliza `pending`.
- Se permite cualquier transición entre los estados definidos, sin un workflow obligatorio.

### Propiedad y permisos

Cada recurso declara permisos con el formato `recurso:acción:alcance`. Para tareas:

| Acción | Alcance propio | Alcance total |
| --- | --- | --- |
| Crear | `tasks:create:own` | `tasks:create:any` |
| Consultar | `tasks:read:own` | `tasks:read:any` |
| Editar | `tasks:update:own` | `tasks:update:any` |
| Eliminar | `tasks:delete:own` | `tasks:delete:any` |

Reglas de evaluación:

- El permiso con alcance `any` autoriza la operación sin evaluar la propiedad del recurso.
- El permiso con alcance `own` autoriza únicamente cuando el propietario del recurso es el usuario autenticado.
- Los nombres de los roles no conceden privilegios implícitos; el acceso depende de los permisos asignados.
- El backend siempre realiza la validación definitiva de permisos.

### Propietario en operaciones de escritura

- Si la solicitud no incluye `ownerId`, el propietario es el usuario autenticado.
- Si la solicitud incluye un `ownerId` distinto del usuario autenticado, se exige el permiso con alcance `any` de esa acción.
- Si no se cuenta con ese permiso, la solicitud se rechaza con `403`. El campo nunca se ignora en silencio.
- El propietario es inmutable después de la creación: `PATCH` no puede transferir la propiedad de un recurso. Una eventual transferencia será una operación explícita y auditable, no un campo más de la edición.

### Eliminación

Las tareas se eliminan permanentemente. No se incluye borrado lógico ni restauración. Esta decisión aplica únicamente a las tareas, no a las cuentas de usuario.

## API HTTP

### Endpoints

```text
GET    /api/tasks
GET    /api/tasks/:id
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id
```

Todas las rutas requieren una sesión autenticada.

### Formato de respuesta

Todas las respuestas exitosas se entregan dentro de un sobre uniforme, sin excepciones.

Recurso individual:

```json
{
  "data": {
    "id": "...",
    "title": "..."
  }
}
```

Colección:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

El sobre permite que el cliente HTTP compartido extraiga `data` en un único lugar, sin que cada consumidor decida la forma endpoint por endpoint.

### Formato de errores

Todos los errores utilizan la misma estructura:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "La solicitud no es válida",
    "details": [
      { "field": "title", "code": "TOO_LONG" }
    ]
  }
}
```

- `code` es un identificador estable, apto para decidir comportamiento en el cliente sin depender de textos.
- `message` es una descripción general legible.
- `details` solo aparece en errores de validación y asocia cada problema a su campo. Se omite en errores como `403` o `404`.
- El código por campo permite que el frontend traduzca el mensaje, en lugar de mostrar texto proveniente del backend.

## Consultas reutilizables

Los listados utilizan una convención común de servidor, expresada con parámetros planos:

```text
/api/tasks?search=informe&status=pending&sort=-createdAt&page=2&limit=20
```

- `search`: búsqueda libre sobre los campos declarados como buscables por cada recurso.
- `sort`: campo de ordenamiento; el prefijo `-` indica orden descendente.
- `page` y `limit`: paginación.
- Filtros: cada campo filtrable se expresa como su propio parámetro.

Cada recurso declara explícitamente sus campos buscables, filtrables y ordenables. No se permiten consultas arbitrarias sobre campos internos de la base de datos, y cualquier parámetro no declarado se rechaza.

Para tareas:

| Uso | Campos permitidos |
| --- | --- |
| Búsqueda | `title`, `description` |
| Filtros | `status`, `ownerId`, `dueDate` |
| Ordenamiento | `createdAt`, `updatedAt`, `dueDate`, `title` |

Los filtros declarados admiten únicamente igualdad. Si en el futuro se requieren operadores como rangos o negaciones, se incorporarán con una sintaxis explícita cuando exista un caso real que lo justifique; no se anticipa un lenguaje de consulta.

### Alcance de los listados

Un listado no evalúa la propiedad recurso por recurso, sino que restringe el conjunto consultado:

- El listado exige el permiso de lectura con alcance propio del recurso.
- El servidor aplica siempre el filtro por propietario del usuario autenticado, salvo que este cuente con el permiso de alcance `any`.
- `ownerId` es además un filtro declarado: solicitar el de otro usuario exige el permiso de alcance `any`. Sin ese permiso, la solicitud se rechaza.

De este modo la ausencia de permisos siempre reduce lo que se ve, nunca lo amplía.

## Paginación

| Parámetro | Valor predeterminado | Mínimo | Máximo |
| --- | --- | --- | --- |
| `page` | `1` | `1` | — |
| `limit` | `20` | `1` | `100` |

- El ordenamiento predeterminado es `-createdAt`.
- `meta` acompaña siempre a los listados con `page`, `limit`, `totalItems` y `totalPages`.
- Un `limit` superior al máximo se rechaza como error de validación; no se recorta en silencio, para que el cliente nunca reciba un conjunto incompleto creyendo que está completo.
- La exportación masiva de datos, si llega a requerirse, será un endpoint específico y no un `limit` sin límite.

## Composición del frontend

Cada CRUD se organiza como una funcionalidad independiente. Reutiliza infraestructura compartida —tabla, paginación, búsqueda, filtros, ordenamiento y confirmaciones— pero conserva formularios, columnas, validaciones, permisos y acceso a la API específicos de su entidad.

No se utilizará un componente universal que genere CRUD completos mediante configuración.

### Listado y navegación

- El listado permanece visible durante la creación y edición.
- La búsqueda, los filtros, el ordenamiento y la página se almacenan en parámetros de la URL.
- Las acciones y rutas visibles reflejan los permisos del usuario.
- El backend siempre realiza la validación definitiva de permisos.

### Panel lateral

La creación y edición se muestran en un panel lateral controlado por rutas:

```text
/tasks
/tasks/new
/tasks/:id/edit
```

Cada entidad reutiliza un único formulario para crear y editar. El panel determina el modo y carga el registro cuando la ruta contiene un identificador.

### Comportamiento del formulario

- Al guardar correctamente, el panel se cierra, el listado se actualiza y se muestra una confirmación.
- Los errores de validación aparecen junto a los campos, utilizando el código por campo devuelto por la API.
- Los errores generales conservan los datos ingresados.
- Cerrar un formulario con cambios sin guardar requiere confirmación.
