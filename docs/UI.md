# Contrato canónico de la interfaz web

Este documento es la referencia única para la interfaz web implementada y sus decisiones de diseño. Está escrito en español profesional; el texto visible de la aplicación permanece en inglés. Las afirmaciones se limitan a la implementación y las pruebas existentes.

## Propósito y leyenda de evidencia

| Estado                      | Significado                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| **Implementado y cubierto** | El comportamiento aparece en código vigente y tiene una prueba relevante.                |
| **Brecha conocida**         | Falta una abstracción o existe una limitación actual; no debe describirse como resuelta. |
| **Intención futura**        | Dirección prevista, no disponible en la implementación actual.                           |

## Ruta rápida para contribuidores

1. Consultar primero los fundamentos y la sección de arquitectura antes de añadir un componente o una pantalla.
2. Trabajar dentro de la carpeta de la funcionalidad (`features/auth` o `features/tasks`) y reutilizar las primitivas existentes.
3. Verificar los estados de carga, error, vacío, permisos y navegación con las pruebas indicadas en el mapa de evidencia.
4. Actualizar este contrato solo cuando el comportamiento implementado o una decisión canónica cambie; no convertir la intención futura en una afirmación de implementación.

## Fundamentos visuales y primitivas reutilizables

La base canónica combina:

- **shadcn/ui** con configuración `base-vega`.
- **Base UI** para los componentes y patrones compatibles disponibles en el proyecto.
- **Vega** como estilo de la configuración de shadcn/ui.
- Variables CSS semánticas de color neutral, con conjuntos para modo claro (`:root`) y oscuro (`.dark`).
- **Lucide** como biblioteca de iconos.
- **Inter Variable** como tipografía sans-serif.

Los tokens semánticos incluyen fondo, texto, tarjeta, popover, primario, secundario, muted, accent, destructive, borde, input, ring y colores de sidebar. Los componentes deben consumir estos tokens en lugar de introducir colores aislados.

Las primitivas compartidas actualmente disponibles incluyen `Button`, `Input`, `Label`, `AlertDialog`, `Sheet`, `Toast`, `Sidebar` y utilidades de foco modal. Las pantallas pueden usar elementos nativos cuando no exista una abstracción compartida; esa situación se registra como brecha, no como una primitiva disponible.

## Arquitectura y organización

La organización es **feature-first** dentro de `apps/web/src/features`.

- **Auth:** el dominio define los modelos y el contrato `AuthRepository`; `HttpAuthRepository` integra HTTP; `SessionStore`, sus selectores y `SessionProvider` coordinan el estado y las acciones de sesión.
- **Tasks:** existe `TaskRepository` para el listado y funciones de acceso para crear, actualizar y eliminar. La orquestación del listado, la edición, la navegación, la consulta y las acciones destructivas permanece local a `TaskListPage`.
- La aplicación no implementa Store + Repository de forma uniforme en todas las funcionalidades. No se debe presentar Tasks como si tuviera la misma separación de coordinación que Auth.

No se crea una segunda guía arquitectónica: este contrato describe únicamente las decisiones de UI y remite al código vigente como evidencia.

## Shell autenticado y Sidebar

El shell autenticado usa `SidebarProvider`, `Sidebar`, `SidebarTrigger`, `SidebarContent`, `SidebarFooter`, `SidebarInset` y un `Outlet` para envolver las rutas protegidas. Incluye un encabezado con el control de navegación y la ruta actual, más un área de contenido fluida.

La Sidebar canónica es:

- **Responsive:** en viewport estrecho funciona como drawer móvil; en desktop se muestra como aside.
- **Colapsable:** alterna entre estados expandido y colapsado mediante el control compartido.
- **Persistida por cookie:** el estado desktop se guarda en `sidebar_state` y se restaura al montar el proveedor.

La navegación implementada expone Inicio y Tareas según el acceso de lectura efectivo, además de la acción de cierre de sesión. La visibilidad en el cliente es una ayuda de navegación, no una frontera de seguridad.

## Auth y superficies de sesión

Las superficies actuales son:

- Rutas públicas de inicio de sesión y registro, con validación, estado de envío y errores visibles.
- Estado de carga durante el bootstrap de sesión.
- Inicio de sesión, registro, restauración y cierre de sesión mediante el Store y el Repository de Auth.
- Renovación silenciosa compartida para solicitudes concurrentes que reciben una respuesta no autorizada.
- Cambio de contraseña en `/password`, conservando la sesión autenticada cuando tiene éxito.
- Limpieza local y retorno al acceso cuando el cierre de sesión remoto falla o la renovación de sesión expira.

El copy visible actual es inglés (`Sign in`, `Create account`, `Loading session`, etc.). Esta documentación permanece en español y no autoriza cambiar ese copy.

## Listado de Tasks y estado de consulta

Las rutas implementadas cubren el listado, la creación y la edición de Tasks. `TaskListPage` coordina:

- Estados de carga con filas que conservan la estructura de la tabla.
- Estado vacío para una colección sin registros.
- Estado diferenciado cuando los criterios activos no producen resultados, con acción para limpiar criterios.
- Estado de error con acción de reintento.
- Tabla de tareas con acciones de fila en un menú accesible cuando el permiso del usuario lo permite.
- Refresco posterior a mutaciones y preservación de la consulta al navegar hacia edición.

La consulta se representa en la URL con `search`, `status`, `ownerId`, `dueDate`, `sort`, `page` y `limit`. El parser aplica valores permitidos y defaults; cambiar criterios reinicia la página. La búsqueda se desacopla mediante debounce y las solicitudes reemplazadas se abortan.

Los controles de consulta actuales son específicos de `TaskListPage` y no constituyen todavía una abstracción compartida.

## Formularios, Sheets y validación

Crear y editar usan el mismo `TaskForm`, mostrado en un `Sheet` controlado por la ruta. El formulario valida título, descripción y fecha; muestra errores junto al campo, conserva los valores ante un error general y deshabilita el envío mientras guarda. Un guardado correcto cierra el panel, actualiza el listado y comunica el resultado.

El botón explícito de cierre de un formulario sucio abre una confirmación para descartar cambios. La confirmación actual no cubre todavía todos los caminos de cierre del `Sheet`: el overlay o la tecla Escape pueden cerrar el panel sin pasar por esa confirmación.

## Acciones destructivas y feedback

Eliminar una Task requiere un `AlertDialog` que identifica el registro, advierte que la acción no se puede deshacer, deshabilita la confirmación durante la solicitud y evita envíos duplicados.

Los `Toast` comunican resultados breves de acciones. Los errores que requieren corrección permanecen junto al formulario o al listado; no se duplican innecesariamente en un toast. Las pruebas de Tasks cubren estados de carga, vacío, filtro sin resultados, error y reintento, acciones de fila y eliminación.

## Routing y autorización

Las rutas protegidas conservan un retorno local seguro al login. Las rutas de Tasks verifican en el cliente los permisos de lectura y de la acción solicitada; un acceso insuficiente muestra `403`. Las rutas inexistentes muestran `404` dentro del shell autenticado y no redirigen silenciosamente al inicio.

El backend es la autoridad definitiva para autenticación y autorización. `AuthGuard` valida el token y carga la identidad; el controlador y la política de Tasks aplican los permisos `own` y `any` para leer, crear, actualizar y eliminar. Las comprobaciones de visibilidad en la UI no sustituyen esas verificaciones del servidor.

## Brechas conocidas

- No existen todavía abstracciones compartidas para `Card`, `Breadcrumb`, `Table`, `Select`, `Textarea`, `Menu`, `Pagination`, `Skeleton` y `EmptyState`.
- Los controles de búsqueda, filtro, ordenamiento y paginación de Tasks siguen siendo ad hoc dentro de la funcionalidad.
- La confirmación de formulario sucio no cubre el cierre del `Sheet` por overlay o Escape.
- El copy visible de la aplicación es inglés; la documentación canónica es español. No se debe inferir una migración de idioma.

## Intención futura

Las siguientes áreas no forman parte de la implementación actual y deben permanecer etiquetadas como futuras:

- Superficie de **Profile** para consultar o editar datos del usuario.
- Sección de **Administration**, incluidos usuarios, roles y permisos.
- Configuración de visibilidad de columnas en los listados.

## Mapa de evidencia

| Área                          | Referencias de implementación                                                                                                                                                                                                                  | Referencias de pruebas                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fundamentos, tokens y aliases | `apps/web/components.json`, `apps/web/package.json`, `apps/web/src/index.css`                                                                                                                                                                  | —                                                                                                                                                         |
| Shell y Sidebar               | `apps/web/src/features/auth/components/authenticated-shell.tsx`, `apps/web/src/components/ui/sidebar.tsx`                                                                                                                                      | `apps/web/src/components/ui/sidebar.test.tsx`, `apps/web/src/App.test.tsx`                                                                                |
| Auth y sesión                 | `apps/web/src/features/auth/domain/auth-repository.ts`, `apps/web/src/features/auth/infrastructure/http-auth-repository.ts`, `apps/web/src/features/auth/store/session-store.ts`, `apps/web/src/features/auth/components/session-provider.tsx` | `apps/web/src/features/auth/store/session-store.test.ts`, `apps/web/src/features/auth/components/session-provider.test.tsx`, `apps/web/src/App.test.tsx`  |
| Tasks y Repository            | `apps/web/src/features/tasks/task-list-page.tsx`, `apps/web/src/features/tasks/task-repository.ts`, `apps/web/src/features/tasks/task-form.tsx`, `apps/web/src/features/tasks/task-query.ts`                                                   | `apps/web/src/features/tasks/task-list-page.test.tsx`, `apps/web/src/features/tasks/task-form.test.tsx`, `apps/web/src/features/tasks/task-query.test.ts` |
| Permisos y rutas              | `apps/web/src/App.tsx`, `apps/web/src/routing.ts`, `apps/web/src/features/tasks/task-permissions.ts`                                                                                                                                           | `apps/web/src/routing.test.ts`, `apps/web/src/features/tasks/task-permissions.test.ts`, `apps/web/src/App.test.tsx`                                       |
| Autoridad del backend         | `apps/api/src/auth/auth.guard.ts`, `apps/api/src/tasks/tasks.controller.ts`, `apps/api/src/tasks/task-policy.ts`                                                                                                                               | `apps/api/src/auth/auth.guard.spec.ts`, `apps/api/src/tasks/task-policy.spec.ts`                                                                          |

Este mapa es evidencia de la implementación actual, no una promesa de que las brechas o las intenciones futuras ya existan.
