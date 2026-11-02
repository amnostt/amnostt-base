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

## Solicitud de recuperación

`POST /api/auth/forgot-password` recibe un correo y responde siempre con el mensaje genérico envuelto por la API:

`Si existe una cuenta activa con ese correo, recibirás instrucciones para recuperar el acceso.`

Solo las cuentas existentes y activas reciben un enlace. La solicitud normaliza el correo, almacena únicamente el hash SHA-256 de un token aleatorio de 32 bytes y reemplaza el enlace anterior del usuario; cada token expira en 30 minutos. Los fallos de configuración o del proveedor también conservan la respuesta genérica y no dejan un token utilizable tras un envío fallido.

Configura `AUTH_PASSWORD_RESET_URL` con una URL fija de la web. Debe ser HTTP(S), sin credenciales, consulta ni fragmento; HTTPS es obligatorio salvo `http://localhost` para desarrollo local. Si falta o no es segura, la API puede iniciar, pero no emite ni envía enlaces. Los límites independientes predeterminados son 5 solicitudes por IP y 3 por correo cada 15 minutos; pueden ajustarse con `AUTH_PASSWORD_RECOVERY_IP_LIMIT`, `AUTH_PASSWORD_RECOVERY_IP_TTL_SECONDS`, `AUTH_PASSWORD_RECOVERY_EMAIL_LIMIT` y `AUTH_PASSWORD_RECOVERY_EMAIL_TTL_SECONDS`.

Esta etapa implementa únicamente la solicitud. La ruta de restablecimiento, consumo de un solo uso, invalidación al cambiar la contraseña y la interfaz web quedan para la siguiente etapa.

## Tests

```bash
pnpm --filter @amnostt/api test
pnpm --filter @amnostt/api test:e2e
```

E2E requires a reachable PostgreSQL database and `DATABASE_URL`; unit tests do not.
