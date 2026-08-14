# CRUD de referencia

La aplicación base utiliza tareas para demostrar un CRUD completo sin introducir reglas de un dominio de negocio específico. Las convenciones generales se reutilizarán en futuros módulos.

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

- Una tarea nueva pertenece al usuario autenticado.
- Si no se especifica un estado, se utiliza `pending`.
- Un permiso específico puede permitir crear tareas para otro usuario.
- Se permite cualquier transición entre los estados definidos, sin un workflow obligatorio.

### Propiedad y permisos

- Cada usuario puede consultar y administrar sus propias tareas.
- Permisos específicos pueden habilitar operaciones sobre tareas de otros usuarios.
- Los nombres de los roles no conceden privilegios implícitos; el acceso depende de los permisos asignados.

### Eliminación

Las tareas se eliminan permanentemente. No se incluye borrado lógico ni restauración. Esta decisión aplica únicamente a las tareas, no a las cuentas de usuario.

## Consultas reutilizables

Los listados utilizan una convención común de servidor:

- `search`: búsqueda libre sobre los campos declarados como buscables por cada recurso.
- `filters`: filtros estructurados sobre campos permitidos.
- `sort`: campo y dirección del ordenamiento.
- `page` y `limit`: paginación.

Cada recurso declara explícitamente sus campos buscables, filtrables y ordenables. No se permiten consultas arbitrarias sobre campos internos de la base de datos. Los filtros por propietario requieren los permisos correspondientes.

## Respuesta paginada

Todos los listados paginados utilizan el mismo formato:

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
- Los errores de validación aparecen junto a los campos y mantienen el panel abierto.
- Los errores generales conservan los datos ingresados.
- Cerrar un formulario con cambios sin guardar requiere confirmación.
