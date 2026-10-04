# Amnostt Base

Amnostt Base es un workspace pnpm para una aplicación web React/Vite, una API NestJS y PostgreSQL mediante Prisma. El estado implementado incluye autenticación, CRUD de Tasks y endpoints de salud; la administración de usuarios, roles y permisos sigue siendo una superficie futura.

## Inicio rápido

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Antes de ejecutar Prisma o iniciar la API, define `DATABASE_URL` en `apps/api/.env`. Para un entorno local completo también se necesitan `SEED_MEMBER_PASSWORD`, `SEED_ADMIN_PASSWORD`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` con valores locales, distintos y no versionados.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:down` conserva el volumen local de PostgreSQL. `docker compose down -v` es destructivo y elimina ese volumen.

## Estado implementado

- **Auth:** registro público con correo y contraseña, login, restauración mediante refresh, logout, `/auth/me` y cambio de contraseña. El registro deriva el nombre desde el correo; no recibe un campo `name`.
- **Tasks:** listar, consultar, crear, actualizar y eliminar tareas con estados, fecha límite, búsqueda, filtros, ordenamiento, paginación y permisos de propiedad.
- **Salud:** `GET /api/health` comprueba liveness y `GET /api/health/ready` comprueba la conexión a PostgreSQL.

Todas las rutas de la API usan el prefijo global `/api`. La interfaz web usa `http://localhost:3000/api` por defecto.

## Comandos habituales

| Comando                             | Uso                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                          | Ejecuta web y API en paralelo.                                             |
| `pnpm dev:web` / `pnpm dev:api`     | Ejecuta una sola aplicación.                                               |
| `pnpm lint`                         | Ejecuta ESLint en web y API.                                               |
| `pnpm test`                         | Ejecuta las suites unitarias de Jest y Vitest.                             |
| `pnpm test:e2e`                     | Ejecuta E2E de API; requiere PostgreSQL y `DATABASE_URL`.                  |
| `pnpm build`                        | Comprueba tipos de web y compila web y API.                                |
| `pnpm db:migrate`                   | Aplica migraciones Prisma.                                                 |
| `pnpm db:seed`                      | Crea roles, permisos y usuarios locales; requiere las contraseñas de seed. |
| `pnpm --filter @amnostt/api format` | Formatea únicamente la API y sus pruebas.                                  |

Antes de entregar cambios, ejecuta:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

## Estructura del workspace

```text
apps/api   API NestJS, Prisma, migraciones y pruebas E2E
apps/web   Aplicación React/Vite y pruebas Vitest
docs       Material histórico y planes conservados explícitamente
```

`packages/*` está reservado y actualmente vacío. El código generado de Prisma está bajo `apps/api/src/generated/prisma` y se mantiene ignorado.

## Autoridades de documentación

| Fuente         | Autoridad                                                                                |
| -------------- | ---------------------------------------------------------------------------------------- |
| `README.md`    | Recorrido humano, estado implementado y comandos de entrada.                             |
| `AGENTS.md`    | Invariantes operativas para agentes y contribuidores.                                    |
| `PRODUCT.md`   | Intención de producto, usuarios y resultados esperados.                                  |
| `DESIGN.md`    | Dirección visual y principios de experiencia.                                            |
| `.impeccable/` | Configuración de proyecto, superficies, críticas y artefactos compartidos de Impeccable. |

El código y sus pruebas son la evidencia definitiva del comportamiento. `PRODUCT.md`, `DESIGN.md` y `.impeccable/` no convierten por sí mismos una intención o recomendación en un contrato implementado.

Para las invariantes de trabajo, consulta `AGENTS.md`.
