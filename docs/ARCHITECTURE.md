# Arquitectura y flujos implementados

Este documento describe el workspace y el comportamiento respaldado por código y pruebas. Es una referencia del estado actual, no una promesa de que las futuras áreas de producto o abstracciones ya existan.

## Workspace

| Área                        | Responsabilidad                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/api` (`@amnostt/api`) | API NestJS, autenticación, autorización, Tasks, health checks y acceso a PostgreSQL mediante Prisma.      |
| `apps/web` (`@amnostt/web`) | SPA Angular con Zard UI; sesión, navegación protegida, listado, creación, edición y eliminación de Tasks. |
| `packages/*`                | Reservado; actualmente vacío.                                                                             |

La API aplica el prefijo `/api`. La web se inicia en `http://localhost:5174` con `pnpm dev:web` o junto a la API con `pnpm dev`; su proxy de desarrollo dirige `/api/**` a `http://localhost:3000`. La web usa rutas relativas y no requiere variables `VITE_*` ni un archivo `.env` propio. El proxy no configura producción: el despliegue debe dirigir `/api` a la API. El esquema y migraciones Prisma viven en `apps/api/prisma`; el cliente generado vive en `apps/api/src/generated/prisma` y no se edita manualmente.

## Límites de la API

`AppModule` reúne módulos de aplicación. `configureApp` establece el prefijo, validación global, normalización de errores y respuestas, e integración CORS con credenciales y origen configurable mediante `CORS_ORIGIN`.

- La validación transforma entradas, permite solo propiedades declaradas y rechaza campos desconocidos.
- Las respuestas definidas se envuelven como `{ data: ... }`, salvo que ya contengan `data`. Un resultado `undefined`, incluido `204 No Content`, no se envuelve.
- Los errores usan `{ error: { code, message, details? } }`; los errores `5xx` se registran en el servidor. Entre los códigos estables están `VALIDATION_FAILED`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `HTTP_ERROR` e `INTERNAL_ERROR`.
- `GET /api/health` comprueba disponibilidad del proceso sin base de datos; `GET /api/health/ready` consulta PostgreSQL y devuelve `503` sanitizado si no está disponible.

## Auth y sesión

El backend es la autoridad para identidad, estado de cuenta, sesiones, roles y permisos. La UI usa esos datos para presentar navegación y estados; no toma decisiones de autorización definitivas.

### Flujo web

1. `apps/web/src/main.ts` inicia la aplicación; `app.config.ts` registra router, HTTP, Zard y `SessionStore.bootstrap()` mediante `provideAppInitializer`.
2. `SessionStore` publica estado de solo lectura mediante señales y coordina login, restauración y logout. El access token permanece privado y en memoria; los consumidores de bootstrap comparten la restauración pendiente.
3. `AuthApi.restore()` solicita refresh mediante cookie y después consulta el usuario actual. La inicialización espera a que termine; un fallo deja la sesión no autenticada. No hay refresh automático de cada solicitud autenticada fallida.
4. `AuthenticatedApiClient` utiliza el control de sesión del store para GET, POST, PATCH y DELETE. Envía credenciales y el access token y rechaza resultados de una sesión sustituida.
5. `authGuard` protege `AppShell` y sus rutas hijas; `permissionGuard` protege Tasks. La shell oculta navegación sin permiso, sin reemplazar la comprobación del servidor. Registro y cambio de contraseña existen en la API, pero no tienen una interfaz conectada en la web.

### Contrato y seguridad

- `POST /api/auth/register`: correo y contraseña; el correo se normaliza y el nombre deriva del correo. No se acepta un campo `name`. La contraseña debe tener 12–128 caracteres.
- `POST /api/auth/login`: correo y contraseña; devuelve access token y `currentUser` para cuenta activa.
- `POST /api/auth/refresh`: usa exclusivamente la cookie de refresh y devuelve un access token nuevo. `GET /api/auth/me` obtiene el principal actual.
- `POST /api/auth/logout`: revoca la sesión cuando puede identificarla, elimina la cookie y responde `204`; es idempotente si la cookie falta o no es válida.
- `POST /api/auth/password`: cambia contraseña usando la contraseña actual; la nueva exige 12–128 caracteres.
- La cookie refresh es `HttpOnly`, `SameSite=Strict`, `Secure` según configuración y limitada a `/api/auth`. La base de datos almacena hashes, no refresh tokens en claro.
- Access y refresh usan secretos distintos de al menos 32 bytes y claims que identifican usuario, sesión y tipo de token. Cada refresh válido rota el token y su hash; reutilizar un token rotado revoca la sesión.
- Guards y servicios comprueban cuenta activa, sesión vigente/no revocada y permisos actuales. Errores de credenciales, cuenta o token no revelan cuál condición falló.

### Autorización

Los permisos siguen el formato `<recurso>:<acción>:<own|any>`. `any` abarca cualquier propietario; `own` requiere que el `ownerId` corresponda al usuario actual. El backend comprueba el permiso y la propiedad en cada operación protegida.

## Tasks

Tasks es el recurso CRUD de referencia, no una abstracción universal para todos los recursos.

### Flujo web y separación existente

La ruta protegida `/tasks` monta `TaskList` dentro de `AppShell`. `TaskList` coordina la consulta URL, la carga, los permisos visibles y las operaciones mediante `TasksApi` y `AuthenticatedApiClient`; los componentes locales de filtros, tabla, paginación y panel de edición viven en `presentation/task-list/components/`, y las pruebas de `TaskList` se agrupan en `presentation/task-list/tests/`. Los modelos, permisos y serialización de consultas están en `features/tasks/domain`; el acceso HTTP está en `infrastructure`.

Los filtros, búsqueda, orden y paginación se serializan en la URL. La creación y edición comparten `TaskForm` y un Sheet, sin rutas adicionales; la edición usa la fila del listado sin solicitar detalle. Eliminar requiere confirmación mediante AlertDialog. Las respuestas obsoletas no deben publicar resultados. La shell puede ocultar Tasks si el usuario no tiene permiso de lectura, pero la API vuelve a autorizar cada petición.

### API y propiedad

Rutas autenticadas: `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id` y `DELETE /api/tasks/:id`.

- Los permisos disponibles son `tasks:create|read|update|delete:own|any`.
- Crear sin `ownerId` asigna el usuario actual. Crear para otra persona exige `tasks:create:any`; un `ownerId` enviado no se descarta silenciosamente.
- Listar exige lectura. Sin `tasks:read:any`, se restringe al propietario actual; filtrar por un `ownerId` ajeno exige permiso `any`.
- Leer, actualizar y eliminar aplican el ámbito de propiedad según permiso. `PATCH` no permite cambiar el propietario.
- Filtros declarados: `search`, `status`, `ownerId`, `dueDate`, `page`, `limit` y `sort`. La búsqueda cubre título y descripción; parámetros desconocidos se rechazan.
- `page` comienza en 1; `limit` predeterminado es 20 y máximo 100; el orden predeterminado es `-createdAt`. La respuesta de lista incluye `data` y `meta` con `page`, `limit`, `totalItems` y `totalPages`.
- Estados: `pending`, `in_progress`, `completed`. Las fechas deben ser fechas válidas `YYYY-MM-DD`.

## Extensión y límites

- Para extender un flujo, sigue primero sus límites existentes: Auth separa modelos, `AuthApi`, `SessionStore` y presentación; Tasks separa dominio, `TasksApi` y presentación, con la coordinación de pantalla en `TaskList` y el formulario en `TaskForm`.
- Las reglas de permisos y propiedad de Tasks son específicas de este recurso. Extraerlas a una abstracción compartida requiere evidencia de otro recurso y una decisión explícita.
- Reutiliza primitivas visuales existentes y conserva carga, vacío, error, permisos, navegación, formularios y confirmación según sus pruebas. Registra componentes faltantes como brechas, no como capacidades.
- Administración de usuarios/roles/permisos, Profile, recuperación por correo y paquetes compartidos no están implementados.
- No cambies copy visible ni presentes intención de `PRODUCT.md`, dirección `DESIGN.md` o artefactos `.impeccable/` como comportamiento vigente.

Para bootstrap y comandos del workspace consulta [`README.md`](../README.md); para reglas de contribución consulta [`AGENTS.md`](../AGENTS.md).

## Detalles de la aplicación web

La entrada de la SPA vive en `apps/web/src/main.ts`; `app.config.ts` configura sus proveedores y `app.routes.ts` sus rutas. La shell protegida y sus componentes usan Zard; los componentes copiados viven en `apps/web/src/app/shared/zard/` y `apps/web/components.json` registra su configuración.

- `SessionStore` mantiene el token en memoria y coordina login, restauración y logout. `AuthenticatedApiClient` reutiliza su control de sesión para GET, POST, PATCH y DELETE; rechaza respuestas de una sesión sustituida. Los guards y las acciones visibles usan permisos, sin sustituir autorización del backend.
- `TaskList` conserva búsqueda, filtros, orden y paginación en la URL y obtiene datos mediante `TasksApi`. `TaskFilters`, `TaskTable` y `TaskPagination` presentan el estado recibido y notifican interacciones a la ruta; `TaskEditorSheet` gestiona el panel y la confirmación de descarte junto a `TaskForm`. Creación y edición comparten el formulario y Sheet inferior en móvil o lateral derecho en escritorio, sin rutas adicionales. El Dropdown de Acciones y el Context Menu de cada fila comparten Editar y Eliminar, con permisos y propiedad comprobados por acción; el formulario se precarga con los datos del listado, sin una petición de detalle adicional.
- El formulario valida título y descripción y envía estado y fecha de calendario mediante POST al crear o PATCH al editar. La edición permite vaciar descripción y vencimiento con `null`. Los cambios se comparan con los valores iniciales del modo correspondiente; descartarlos requiere confirmación y cancelar conserva la misma instancia y sus valores. Durante el guardado se bloquean los cierres por botón, Escape y fondo. Un guardado exitoso cierra el Sheet y actualiza la consulta vigente; un fallo conserva el borrador y permite reintentar.
- Eliminar exige `tasks:delete:any` o `tasks:delete:own` sobre una tarea propia, con nueva comprobación de la sesión al abrir y confirmar. El AlertDialog se cierra al aceptar y envía DELETE sin cuerpo; la API responde 204. El listado muestra progreso, bloquea eliminaciones duplicadas y conserva la fila hasta el éxito; entonces recarga la consulta vigente. Un fallo conserva la fila y permite volver a confirmar. Una respuesta de una sesión sustituida o posterior a la destrucción no publica resultados ni recarga el listado.
- El registro de usuarios en Angular sigue pendiente. Las pruebas usan HTTP simulado; no prueban persistencia real ni E2E en navegador. El usuario informó la comprobación manual de creación, edición y eliminación; estas confirmaciones no equivalen a verificación automatizada en navegador o de persistencia real.

Las pruebas automatizadas de Tasks se concentran en reglas, datos y operaciones CRUD: autorización, validación, integridad de borradores y payloads, consultas, respuestas obsoletas y recuperación ante errores. La colocación visual y otros detalles de presentación se comprueban manualmente, no se presentan como prueba automatizada de navegador.

Consulta el detalle en la [guía de la web](../apps/web/README.md). Los comandos raíz `pnpm lint`, `pnpm test` y `pnpm build` cubren Angular y API; usa `CI=true pnpm test` para una ejecución automatizada sin watch. Las pruebas web aisladas se ejecutan con `pnpm --filter @amnostt/web test --watch=false`.
