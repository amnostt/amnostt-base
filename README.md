# Amnostt Base

A pnpm workspace with a React/Vite web app, a NestJS API, and PostgreSQL through Prisma. The implemented API includes authentication, task CRUD, liveness, and database readiness endpoints.

## Quick path

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set `DATABASE_URL`, `SEED_MEMBER_PASSWORD`, `SEED_ADMIN_PASSWORD`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` in `apps/api/.env`. Use locally generated, distinct values; do not commit that file or paste secrets into commands, logs, or documentation.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @amnostt/api start:prod
```

`start:prod` executes the built entrypoint at `apps/api/dist/src/main.js`. It must follow `pnpm build`; it does not run migrations or seeds.

## Runtime checks

| Endpoint | Purpose | Database dependency |
| --- | --- | --- |
| `GET /api/health` | Liveness: process can serve HTTP. | No |
| `GET /api/health/ready` | Readiness: process can query PostgreSQL. | Yes |

Both successful responses are `200` with the standard success envelope: `{"data":{"status":"ok"}}`. Readiness returns a sanitized `503` error when the database is unavailable; unexpected server errors are logged server-side while their client response stays sanitized.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start web and API for development. |
| `pnpm build` | Build web and API. |
| `pnpm lint` | Lint web and API. |
| `pnpm test` | Run API Jest unit tests and Web Vitest unit tests. |
| `pnpm test:e2e` | Run API E2E tests; requires PostgreSQL and `DATABASE_URL`. |
| `pnpm db:up` / `pnpm db:down` | Start / stop local PostgreSQL without deleting its volume. |
| `pnpm db:migrate` | Apply Prisma migrations. |
| `pnpm db:seed` | Seed roles, permissions, and local sample users; requires the two seed passwords. |

Run the repository verification gate with:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

## Local database lifecycle

The reproducible local bootstrap order is **migrate → seed → start**. `pnpm db:migrate` applies versioned migrations, `pnpm db:seed` is idempotent for the documented roles and sample users, and production start serves the compiled API. E2E is deliberately separate from the unit gate because it starts Nest with a real PostgreSQL connection.

`pnpm db:down` retains local data. `docker compose down -v` deletes the PostgreSQL volume and is destructive.

## Repository layout

```text
apps/api   NestJS API, Prisma schema, migrations, and E2E tests
apps/web   React/Vite application and unit tests
docs       Product and API contracts
```
