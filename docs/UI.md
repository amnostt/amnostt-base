# Interfaz autenticada

Este documento registra la composición y el comportamiento confirmados para la interfaz después del inicio de sesión. El frontend utilizará shadcn/ui como base de componentes, conservando su comportamiento predeterminado salvo cuando se definan reglas explícitas de la aplicación.

## Inicio

Después del login, el usuario accede a una página de inicio neutral con un mensaje personalizado de bienvenida. El espacio queda preparado para incorporar métricas en el futuro, pero inicialmente no muestra datos ni indicadores artificiales.

## Estructura general

La aplicación autenticada utiliza:

- Una barra lateral colapsable basada en el componente `Sidebar` de shadcn/ui.
- Una barra superior con el control de la barra lateral y el breadcrumb de la ruta actual.
- Un área de contenido fluida que ocupa el espacio disponible con márgenes internos consistentes.

No se personalizará inicialmente el comportamiento responsive o la persistencia de estado de la barra lateral; se mantendrá el comportamiento predeterminado de shadcn/ui.

## Navegación

La barra lateral contiene:

- Inicio, siempre visible.
- Tareas, visible según permisos.
- Administración, visible según permisos:
  - Usuarios.
  - Roles y permisos.
- Menú del usuario en la parte inferior:
  - Perfil.
  - Cerrar sesión.

Las opciones se muestran de acuerdo con los permisos efectivos. El backend continúa siendo la autoridad definitiva para autorizar cada operación.

## Páginas de listado

Los listados CRUD utilizan esta composición:

1. Título.
2. Toolbar.
3. Tabla.
4. Paginación.

### Toolbar

La toolbar puede contener:

- Búsqueda.
- Filtros.
- Configuración de visibilidad de columnas.
- Acciones secundarias específicas del módulo.
- Acción principal.

La configuración de tabla permite únicamente mostrar u ocultar columnas. No se incluyen inicialmente cambios de densidad, reordenamiento, selección múltiple ni acciones masivas.

### Tabla

- Editar y eliminar aparecen en un menú de tres puntos al final de cada fila y respetan los permisos del usuario.
- Las filas no son clicables mientras no exista una vista de detalle.
- La paginación, búsqueda, filtros y ordenamiento se representan en la URL.

### Estados

- Durante la carga se muestran filas esqueleto que conservan la estructura de la tabla.
- Si no existen registros, se muestra un estado vacío con la acción principal cuando el usuario puede crear.
- Si la búsqueda o los filtros no producen resultados, se muestra un mensaje específico y una acción para limpiar los criterios.
- Si ocurre un error, se muestra una acción para reintentar.

## Creación y edición

La creación y edición utilizan un panel lateral controlado por rutas. Cada entidad comparte un único formulario específico para ambos modos.

- Al guardar correctamente, el panel se cierra, el listado se actualiza y se muestra una confirmación.
- Los errores de validación aparecen junto a los campos y mantienen abierto el panel.
- Los errores generales conservan los datos ingresados.
- Cerrar un formulario con cambios sin guardar requiere confirmación.

## Acciones destructivas

La eliminación permanente requiere un diálogo que:

- Identifique el registro afectado.
- Indique que la acción no puede deshacerse.
- Deshabilite la acción destructiva mientras se procesa.
- Evite solicitudes duplicadas.

## Notificaciones

Los toasts se utilizan únicamente para resultados breves de acciones, como creación, actualización, eliminación o fallos generales. Los errores que requieren corrección permanecen junto al formulario o la tabla y no se duplican en toasts.

## Sesión

### Cierre de sesión

El cierre de sesión es inmediato y no requiere confirmación:

1. Se solicita la revocación de la sesión en el backend.
2. Se elimina el access token de la memoria.
3. Se redirige al login.

Si falla la revocación remota, el estado local se limpia igualmente.

### Sesión expirada

- Cuando expira el access token, se intenta una única renovación silenciosa.
- Las solicitudes concurrentes esperan el mismo intento de renovación.
- Si la renovación falla, se limpia la sesión y se redirige al login.
- Después de autenticarse nuevamente, el usuario vuelve a la ruta protegida que intentaba visitar.

## Perfil

El usuario puede:

- Consultar su nombre, correo electrónico, rol y permisos efectivos.
- Editar únicamente su nombre.
- Cambiar su contraseña mediante el flujo definido.

El usuario no puede modificar por cuenta propia su correo electrónico ni su rol.

## Acceso y errores de ruta

- Un usuario no autenticado es redirigido al login y se conserva la ruta solicitada.
- Un usuario autenticado sin permisos ve una página `403` dentro del layout autenticado.
- Una ruta inexistente muestra una página `404`.
- No se redirige silenciosamente al inicio, porque eso ocultaría la causa del problema.
