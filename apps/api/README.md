# Amnostt API

NestJS API for Amnostt Base. Build before starting in production; the compiled entrypoint is `dist/src/main.js`.

## Local runtime

From the repository root, create `apps/api/.env` from its example and provide local values for `DATABASE_URL`, seed passwords, and JWT secrets. Never commit or share that file.

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @amnostt/api start:prod
```

## Health endpoints

- `GET /api/health` is liveness and does not contact PostgreSQL.
- `GET /api/health/ready` checks PostgreSQL and returns a sanitized `503` when it is unavailable.

Successful health responses use the normal API envelope: `{"data":{"status":"ok"}}`.

## Tests

```bash
pnpm --filter @amnostt/api test
pnpm --filter @amnostt/api test:e2e
```

E2E requires a reachable PostgreSQL database and `DATABASE_URL`; unit tests do not.
