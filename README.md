# Amnostt Base

Amnostt Base es una plantilla inicial reutilizable para proyectos de negocio derivados: un workspace pnpm con API NestJS, aplicación web React/Vite y PostgreSQL gestionado mediante Prisma. Auth proporciona identidad y sesiones; Tasks es un recurso de referencia para demostrar gestión y autorización, no el producto final de los proyectos derivados.

## Inicio local

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Define `DATABASE_URL` en `apps/api/.env` antes de ejecutar Prisma o iniciar la API. Para completar el entorno local también se requieren valores distintos y no versionados para `SEED_MEMBER_PASSWORD`, `SEED_ADMIN_PASSWORD`, `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm dev` inicia la aplicación web y la API. Usa `pnpm dev:web` o `pnpm dev:api` para iniciar una sola aplicación. `pnpm db:down` conserva el volumen de PostgreSQL; `docker compose down -v` lo elimina.

## Capacidades implementadas

- **Auth:** registro, inicio de sesión, restauración mediante refresh, cierre de sesión, consulta del usuario actual y cambio de contraseña.
- **Tasks:** listado, consulta, creación, actualización y eliminación con permisos de propiedad, filtros, ordenamiento y paginación.
- **Salud:** `GET /api/health` para liveness y `GET /api/health/ready` para readiness de la base de datos.

El backend es la autoridad de identidad, sesiones, permisos y propiedad. La administración de usuarios y roles, así como Profile, no están implementados.

## Comandos habituales

| Comando | Uso |
| --- | --- |
| `pnpm lint` | Ejecuta lint en web y API. |
| `pnpm test` | Ejecuta las pruebas unitarias Jest de API y Vitest de web. |
| `pnpm test:e2e` | Ejecuta E2E de API; requiere PostgreSQL y `DATABASE_URL`. |
| `pnpm build` | Comprueba tipos y compila web; compila la API. |
| `pnpm db:migrate` / `pnpm db:seed` | Aplica migraciones / crea datos seed locales. |

Antes de entregar cambios, ejecuta `pnpm lint`, `pnpm test`, `pnpm build` y `git diff --check`.

## Documentación

- [Arquitectura y flujos implementados](docs/ARCHITECTURE.md)
- [Reglas para agentes y contribuidores](AGENTS.md)
- [Contexto de producto](PRODUCT.md) y [baseline visual](DESIGN.md)

El código y las pruebas son la autoridad del comportamiento implementado. La intención de producto, la dirección visual y los artefactos de Impeccable no establecen contratos de ejecución.
