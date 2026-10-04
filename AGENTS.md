# Guía de agentes y contribuidores

Esta guía define cómo trabajar en el workspace sin confundir intención, dirección visual y comportamiento implementado. Verifica siempre el código y las pruebas antes de actualizar documentación o describir una capacidad.

## Jerarquía de autoridad

1. **Código y pruebas vigentes:** autoridad del comportamiento real.
2. **`AGENTS.md`:** invariantes operativas, límites y comandos para contribuir.
3. **`README.md`:** entrada humana, bootstrap y estado implementado.
4. **`PRODUCT.md`:** intención de producto, usuarios y resultados esperados; no prueba implementación.
5. **`DESIGN.md`:** dirección visual; no sustituye una decisión implementada.
6. **`.impeccable/`:** configuración de proyecto, superficies y críticas compartidas de Impeccable.
7. **`docs/CRUD_PLAN.md`:** plan histórico; no es autoridad de comportamiento actual.

Cuando dos fuentes discrepan, conserva la fuente de mayor autoridad, registra la discrepancia y verifica antes de editar. Una recomendación de Impeccable, una crítica visual o una intención de producto no se convierte automáticamente en un contrato.

## Bootstrap y workspace

- Usa Node.js y Docker Compose; el repositorio no fija una versión de Node.
- Habilita pnpm desde el campo `packageManager` y respeta el lockfile:
  ```bash
  corepack enable
  pnpm install --frozen-lockfile
  ```
- Copia `.env.example`, `apps/api/.env.example` y `apps/web/.env.example` sin versionar los archivos resultantes.
- `apps/api/.env.example` no contiene `DATABASE_URL`; agrégala localmente antes de ejecutar Prisma o arrancar la API.
- El workspace contiene `@amnostt/api` en `apps/api` y `@amnostt/web` en `apps/web`; `packages/*` está reservado y vacío.

Bootstrap local reproducible:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` inicia web y API en paralelo. Usa `pnpm dev:web` o `pnpm dev:api` para una sola aplicación. `pnpm db:down` conserva el volumen de PostgreSQL; `docker compose down -v` elimina datos locales y requiere autorización explícita.

## Comandos y comprobaciones

- `pnpm lint`: lint de web y API.
- `pnpm test`: Jest de API y Vitest de web.
- `pnpm test:e2e`: E2E de API, separado porque necesita PostgreSQL y `DATABASE_URL`.
- `pnpm build`: `tsc -b`/Vite para web y compilación Nest de API; no existe un typecheck independiente.
- `pnpm --filter @amnostt/api format`: único formatter de API; modifica fuente y pruebas de API.
- `pnpm --filter @amnostt/web format:check`: comprobación no mutante de Prettier para web.
- `git diff --check`: integridad de whitespace del diff.

Gate habitual:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

No ejecutes un formatter mutante sobre fuentes de Impeccable instaladas por su herramienta. Antes de verificar, normaliza solo Markdown y configuración que el repositorio soporte de forma segura; después de normalizar, usa únicamente comandos no mutantes.

## API: límites y contratos

`AppModule` inicia la API NestJS. `configureApp` establece:

- prefijo global `/api`;
- `ValidationPipe` con `transform`, `whitelist` y `forbidNonWhitelisted`, por lo que los campos desconocidos se rechazan;
- `ApiResponseInterceptor`, que envuelve respuestas definidas como `{ data: ... }` sin volver a envolver un cuerpo que ya contiene `data`;
- respuesta `undefined` sin envoltorio, incluido el caso `204 No Content`;
- `ApiExceptionFilter`, que normaliza errores en `{ error: { code, message, details? } }` y registra errores `5xx` en el servidor;
- CORS con credenciales y origen configurable mediante `CORS_ORIGIN`.

Los códigos de error estables incluyen `VALIDATION_FAILED`, `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `HTTP_ERROR` e `INTERNAL_ERROR`. Los detalles de validación contienen campo y código normalizado cuando están disponibles. No describas un sobre uniforme sin la excepción de respuestas `undefined`/`204`.

La API de salud expone `GET /api/health` sin dependencia de base de datos y `GET /api/health/ready`, que ejecuta una consulta a PostgreSQL y devuelve `503` sanitizado si no está disponible.

## Auth, sesiones y seguridad

- El backend es la autoridad de identidad, sesión, roles y permisos; la UI solo facilita navegación.
- Registro público: `POST /api/auth/register` recibe correo y contraseña. El correo se normaliza, la contraseña exige 12–128 caracteres, y el nombre se deriva del correo. No documentes un `name` requerido.
- Login: `POST /api/auth/login` recibe solo correo y contraseña y responde con access token y `currentUser` para una cuenta activa.
- `POST /api/auth/refresh` usa exclusivamente la cookie de refresh y devuelve un nuevo access token; `GET /api/auth/me` obtiene el principal actual.
- `POST /api/auth/logout` revoca la sesión cuando puede identificarla, elimina la cookie y responde `204`; es idempotente para cookie ausente o inválida.
- `POST /api/auth/password` permite cambiar la contraseña con la contraseña actual; la validación exige contraseña nueva de 12–128 caracteres.
- El access token vive únicamente en memoria del frontend. Nunca guardes tokens en `localStorage`, `sessionStorage` ni cookies de aplicación.
- El refresh token se entrega en cookie `HttpOnly`, `SameSite=Strict`, `Secure` según configuración segura y con path `/api/auth`; solo se almacenan hashes en la base de datos.
- Los tokens access y refresh usan secretos separados, de al menos 32 bytes, y payloads que identifican usuario, sesión y tipo de token.
- Cada refresh válido rota el token y actualiza el hash de la sesión. La reutilización de un token rotado revoca la sesión.
- El guard y el servicio verifican cuenta activa, sesión no revocada, expiración y permisos actuales en el backend. No confíes en roles o permisos incluidos en el cliente.
- Las credenciales inválidas, cuentas desactivadas, sesiones inválidas y tokens inválidos producen errores no reveladores de autenticación.
- La autorización usa permisos `<recurso>:<acción>:<own|any>`. `any` cubre cualquier propietario; `own` exige que `ownerId` coincida con `currentUser.id`.

## Tasks y autorización de propiedad

Las reglas siguientes están verificadas para Tasks; no las presentes como un framework universal para todos los recursos.

- Rutas autenticadas: `GET /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id` y `DELETE /api/tasks/:id`.
- Los permisos disponibles siguen `tasks:create|read|update|delete:own|any`.
- Crear sin `ownerId` asigna el usuario actual y requiere permiso `tasks:create:own` o `tasks:create:any`. Crear para otro propietario exige `tasks:create:any`; nunca se ignora un `ownerId` enviado.
- Listar exige lectura. Sin `tasks:read:any`, el servidor restringe el conjunto al propietario actual. Un filtro `ownerId` ajeno exige `tasks:read:any`.
- Leer, editar y eliminar restringen por propietario cuando solo existe permiso `own`; `any` permite el recurso ajeno. El propietario no se edita mediante `PATCH`.
- Las consultas admiten `search`, `status`, `ownerId`, `dueDate`, `page`, `limit` y `sort`. La búsqueda cubre título y descripción; los filtros son declarados y no se aceptan parámetros desconocidos.
- `page` comienza en 1, `limit` por defecto es 20 y máximo 100, y el orden por defecto es `-createdAt`. Los listados devuelven `data` y `meta` con page, limit, totalItems y totalPages.
- Los estados son `pending`, `in_progress` y `completed`; las fechas usan `YYYY-MM-DD` válido.
- El backend realiza la comprobación definitiva aunque la UI oculte acciones sin permiso.

## Web: arquitectura y diseño

- La aplicación es feature-first bajo `apps/web/src/features`; las áreas actuales son `auth` y `tasks`.
- Auth separa modelos y `AuthRepository`, `HttpAuthRepository`, `SessionStore`, selectores y `SessionProvider`. El access token se conserva en memoria y las solicitudes no autorizadas comparten renovación.
- Tasks tiene `TaskRepository` para listado y funciones de acceso para crear, actualizar y eliminar; la orquestación de listado, edición, navegación, consultas y acciones destructivas permanece en `TaskListPage`.
- No presentes Tasks como si tuviera la misma separación de coordinación que Auth ni extraigas abstracciones universales sin evidencia de un segundo recurso.
- Las rutas protegidas usan `AuthenticatedShell`, sidebar y retorno local seguro al login. La UI puede mostrar `403` o `404`, pero no reemplaza autorización backend.
- `components.json` define shadcn `base-vega`, Base UI compatible, Tailwind con variables CSS, aliases `@/*` y Lucide. La fuente visual actual es Inter Variable con tokens semánticos neutrales y modos claro/oscuro en `apps/web/src/index.css`.
- Reutiliza las primitivas disponibles antes de crear otra. Las brechas conocidas de componentes compartidos deben registrarse como brechas, no como capacidades existentes.
- Preserva estados de carga, vacío, error, permisos, navegación, confirmación de eliminación y formularios según las pruebas existentes. No cambies el copy visible de la aplicación al editar documentación.

## Prisma y archivos generados

- `apps/api/prisma.config.ts` requiere `DATABASE_URL` y apunta a `apps/api/prisma/migrations`.
- `apps/api/src/generated/prisma` es código generado e ignorado; nunca lo edites manualmente. Ejecuta `pnpm prisma:generate` solo después de cambios autorizados de esquema o cuando falten artefactos.
- Las migraciones versionadas sí son fuente del repositorio. No edites manualmente `migration_lock.toml`.

## Impeccable y autoridades compartidas

- La instalación de proyecto para OpenCode vive en el proveedor de proyecto que confirme la herramienta oficial; no inventes flags ni sobrescribas configuración ajena.
- La inicialización oficial se intenta mediante `/impeccable init` dentro del harness. Si el runtime no permite invocarlo y no existe equivalente documentado, registra la inicialización como parcial y conserva solo los artefactos confirmados.
- Versiona las autoridades compartidas de configuración, dirección, superficies y críticas que genere Impeccable. Ignora únicamente configuración local efímera, cachés, screenshots, revisiones, preguntas, sesiones, previews, anotaciones y estado de edición manual conforme al bloque marcador upstream.
- Usa `PRODUCT.md` para intención de producto, `DESIGN.md` para dirección visual y `.impeccable/` para configuración, superficies y críticas. `README.md` y este archivo son las entradas generales; no dupliques aquí el contenido especializado completo.
- Si una recomendación, crítica o superficie contradice código y pruebas, no la implementes silenciosamente: documenta el conflicto y requiere una decisión explícita.
- El detector de Impeccable es baseline; no autoriza remediar `apps/web/src` en esta tarea.

## Límites protegidos

- Esta feature es documental y de configuración. No modificar `apps/web/src`, fuente API, pruebas, esquema Prisma, migraciones ni comportamiento runtime.
- No afirmar que administración, Profile, CI, hooks, paquetes compartidos o abstracciones futuras están implementados sin evidencia actual.
- Conservar `.codegraph/` y `docs/CRUD_PLAN.md`; este último es histórico y solo admite una reparación mínima de referencias si es necesaria.
- Antes de entregar, verifica el alcance del diff, los enlaces, las rutas documentadas y todos los comandos del gate. No marques tareas del tracker sin resultado observado.
