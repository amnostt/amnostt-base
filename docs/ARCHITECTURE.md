# Arquitectura y flujos implementados

Este documento describe el workspace y el comportamiento respaldado por código y pruebas. Es una referencia del estado actual, no una promesa de que las futuras áreas de producto o abstracciones ya existan.

## Workspace

| Área                        | Responsabilidad                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/api` (`@amnostt/api`) | API NestJS, autenticación, autorización, Tasks, health checks, correo y acceso a PostgreSQL mediante Prisma. |
| `apps/web` (`@amnostt/web`) | SPA Angular con Zard UI; sesión, navegación protegida, listado, creación, edición y eliminación de Tasks.    |
| `packages/*`                | Reservado; actualmente vacío.                                                                                |

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
5. La ruta pública `/forgot-password` usa `AuthApi.forgotPassword()` con cookies, sin access token, normaliza el correo en el cliente y muestra siempre el mensaje genérico aprobado en éxito. La validación local impide solicitudes vacías, inválidas o mayores de 254 caracteres; los estados pendiente, límite de solicitudes y red son seguros y permiten reintentar.
6. La ruta pública `/reset-password` valida sin mostrar el token de 43 caracteres y exige localmente una contraseña de 12–128 caracteres. `SessionStore.resetPassword()` envía el cuerpo mediante `AuthApi.resetPassword()` y, tras un `204`, invalida la sesión local y las completaciones pendientes de bootstrap/login mediante `sessionRevision`; no llama a login, logout ni refresh. Los enlaces inválidos, respuestas 401, límites y fallos de red muestran estados seguros; el éxito limpia la contraseña y reemplaza la URL por `/login` con una confirmación fija.
7. `authGuard` protege `AppShell` y sus rutas hijas; `permissionGuard` protege Tasks. La shell oculta navegación sin permiso, sin reemplazar la comprobación del servidor. Registro y cambio de contraseña existen en la API, pero no tienen una interfaz conectada en la web.

### Contrato y seguridad

- `POST /api/auth/register`: correo y contraseña; el correo se normaliza y el nombre deriva del correo. No se acepta un campo `name`. La contraseña debe tener 12–128 caracteres.
- `POST /api/auth/login`: correo y contraseña; devuelve access token y `currentUser` para cuenta activa.
- `POST /api/auth/refresh`: usa exclusivamente la cookie de refresh y devuelve un access token nuevo. `GET /api/auth/me` obtiene el principal actual.
- `POST /api/auth/logout`: revoca la sesión cuando puede identificarla, elimina la cookie y responde `204`; es idempotente si la cookie falta o no es válida.
- `POST /api/auth/password`: cambia contraseña usando la contraseña actual; la nueva exige 12–128 caracteres.
- `POST /api/auth/forgot-password`: solicita un enlace de recuperación con una respuesta genérica para cuentas activas, inactivas o inexistentes. Normaliza el correo, no crea ni reactiva cuentas y aplica límites independientes por IP y correo.
- `POST /api/auth/reset-password`: consume `{ token, newPassword }` una sola vez, valida la huella de la contraseña vigente dentro de una transacción serializable, cambia la contraseña, invalida recuperaciones pendientes y revoca todas las sesiones. Responde `204` sin iniciar sesión ni emitir tokens y limpia la cookie refresh.
- `GET /api/auth/google/status`: ruta autenticada que devuelve solo `{ provider: "google", enabled, clientId, linked }`; el client ID es público y no se exponen `sub`, tokens, hashes ni nonces.
- `POST /api/auth/google/link/challenge`: ruta autenticada que emite un challenge de diez minutos ligado al usuario y a la sesión vigente; devuelve `challengeId`, `nonce` y `expiresAt` para inicializar GIS popup.
- `POST /api/auth/google/link`: ruta autenticada que recibe `{ challengeId, credential }`. La API valida el ID token con `google-auth-library`, exige `sub`, `email_verified`, nonce y correo normalizado coincidente, y consume el challenge y crea la identidad de forma atómica. Responde `{ provider: "google", linked: true }`; no reemplaza correo, contraseña, rol ni sesiones.
- La cookie refresh es `HttpOnly`, `SameSite=Strict`, `Secure` según configuración y limitada a `/api/auth`. La base de datos almacena hashes, no refresh tokens en claro.
- Access y refresh usan secretos distintos de al menos 32 bytes y claims que identifican usuario, sesión y tipo de token. Cada refresh válido rota el token y su hash; reutilizar un token rotado revoca la sesión.
- Guards y servicios comprueban cuenta activa, sesión vigente/no revocada y permisos actuales. Errores de credenciales, cuenta o token no revelan cuál condición falló.

### Autorización

Los permisos siguen el formato `<recurso>:<acción>:<own|any>`. `any` abarca cualquier propietario; `own` requiere que el `ownerId` corresponda al usuario actual. El backend comprueba el permiso y la propiedad en cada operación protegida.

## Correo transaccional y solicitud de recuperación

`MailModule` se registra en `AppModule`, se importa explícitamente en `AuthModule` y exporta `MailService`. `send` lee `MAIL_FROM` y `RESEND_API_KEY` mediante el `ConfigService` existente y valida esa configuración, el destinatario, el asunto y el texto justo antes de enviar; una API sin configuración de correo puede iniciar mientras no se invoque el servicio.

`POST /api/auth/forgot-password` consulta solo cuentas existentes y activas y devuelve siempre el mismo mensaje aprobado. Para una cuenta válida genera un token opaco aleatorio de 32 bytes, conserva únicamente su hash SHA-256 y lo vincula mediante otra huella SHA-256 al `passwordHash` vigente. La fila única por usuario vence en 30 minutos y una nueva solicitud la reemplaza dentro de una transacción serializable con reintentos acotados ante `P2034`. El enlace usa exclusivamente `AUTH_PASSWORD_RESET_URL`, una URL fija HTTP(S) sin credenciales, consulta ni fragmento; HTTP solo se admite para `localhost` en desarrollo. La configuración ausente o inválida falla cerradamente sin crear una fila.

El servicio realiza un único `POST` de texto plano a Resend con `Authorization: Bearer`, `User-Agent` explícito y redirecciones rechazadas. Los fallos de proveedor, red, timeout o cuerpo inválido se convierten en una respuesta genérica; tras un fallo de envío se elimina condicionalmente solo el hash emitido por esa solicitud, sin borrar una fila reemplazante más nueva. Los límites de recuperación tienen namespace propio y valores predeterminados de 5 por IP y 3 por correo cada 15 minutos, sin compartir los filtros de login o registro.

Las pruebas son deterministas y usan la inyección de Nest para bloquear envíos reales. La API implementa ambos endpoints; la web conecta la solicitud pública y el restablecimiento mediante formularios y HTTP simulado. No existe una prueba de envío con un proveedor real. Los enlaces de restablecimiento usan un límite independiente por IP de 10 intentos cada 15 minutos, además de los límites de solicitud por IP y correo.

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
- Administración de usuarios/roles/permisos, Profile y paquetes compartidos no están implementados. La solicitud de recuperación por correo y el reset-password están conectados en la web.
- No cambies copy visible ni presentes intención de `PRODUCT.md`, dirección `DESIGN.md` o artefactos `.impeccable/` como comportamiento vigente.

Para bootstrap y comandos del workspace consulta [`README.md`](../README.md); para reglas de contribución consulta [`AGENTS.md`](../AGENTS.md).

## Detalles de la aplicación web

La entrada de la SPA vive en `apps/web/src/main.ts`; `app.config.ts` configura sus proveedores y `app.routes.ts` sus rutas. La shell protegida y sus componentes usan Zard; los componentes copiados viven en `apps/web/src/app/shared/zard/` y `apps/web/components.json` registra su configuración.

- `SessionStore` mantiene el token en memoria y coordina login, restauración y logout. `AuthenticatedApiClient` reutiliza su control de sesión para GET, POST, PATCH y DELETE; rechaza respuestas de una sesión sustituida. Los guards y las acciones visibles usan permisos, sin sustituir autorización del backend.
- `TaskList` conserva búsqueda, filtros, orden y paginación en la URL y obtiene datos mediante `TasksApi`. `TaskFilters`, `TaskTable` y `TaskPagination` presentan el estado recibido y notifican interacciones a la ruta; `TaskEditorSheet` gestiona el panel y la confirmación de descarte junto a `TaskForm`. Creación y edición comparten el formulario y Sheet inferior en móvil o lateral derecho en escritorio, sin rutas adicionales. El Dropdown de Acciones y el Context Menu de cada fila comparten Editar y Eliminar, con permisos y propiedad comprobados por acción; el formulario se precarga con los datos del listado, sin una petición de detalle adicional.
- El formulario valida título y descripción y envía estado y fecha de calendario mediante POST al crear o PATCH al editar. La edición permite vaciar descripción y vencimiento con `null`. Los cambios se comparan con los valores iniciales del modo correspondiente; descartarlos requiere confirmación y cancelar conserva la misma instancia y sus valores. Durante el guardado se bloquean los cierres por botón, Escape y fondo. Un guardado exitoso cierra el Sheet y actualiza la consulta vigente; un fallo conserva el borrador y permite reintentar.
- Eliminar exige `tasks:delete:any` o `tasks:delete:own` sobre una tarea propia, con nueva comprobación de la sesión al abrir y confirmar. El AlertDialog se cierra al aceptar y envía DELETE sin cuerpo; la API responde 204. El listado muestra progreso, bloquea eliminaciones duplicadas y conserva la fila hasta el éxito; entonces recarga la consulta vigente. Un fallo conserva la fila y permite volver a confirmar. Una respuesta de una sesión sustituida o posterior a la destrucción no publica resultados ni recarga el listado.
- El registro y el cambio de contraseña en Angular siguen pendientes. La solicitud de recuperación pública y el reset-password ya están conectados y sus pruebas usan HTTP simulado; no prueban persistencia real, envío real de correo ni E2E en navegador. El usuario informó la comprobación manual de creación, edición y eliminación; estas confirmaciones no equivalen a verificación automatizada en navegador o de persistencia real.

Las pruebas automatizadas de Tasks se concentran en reglas, datos y operaciones CRUD: autorización, validación, integridad de borradores y payloads, consultas, respuestas obsoletas y recuperación ante errores. La colocación visual y otros detalles de presentación se comprueban manualmente, no se presentan como prueba automatizada de navegador.

Consulta el detalle en la [guía de la web](../apps/web/README.md). Los comandos raíz `pnpm lint`, `pnpm test` y `pnpm build` cubren Angular y API; usa `CI=true pnpm test` para una ejecución automatizada sin watch. Las pruebas web aisladas se ejecutan con `pnpm --filter @amnostt/web test --watch=false`.
