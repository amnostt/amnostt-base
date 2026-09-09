# Guía de agentes del repositorio

## Inicio rápido

- Usa Node.js y Docker con Compose; este repositorio no fija una versión de Node.
- Habilita el gestor de paquetes declarado, instala desde el lockfile y copia todos los ejemplos de entorno:
  ```bash
  corepack enable
  pnpm install --frozen-lockfile
  cp .env.example .env
  cp apps/api/.env.example apps/api/.env
  cp apps/web/.env.example apps/web/.env
  ```
- `apps/api/.env.example` omite `DATABASE_URL`, que es obligatorio; agrégalo localmente antes de ejecutar comandos de Prisma o iniciar la API.
- Inicia las dependencias y aplica las migraciones antes del desarrollo:
  ```bash
  pnpm db:up
  pnpm db:migrate
  pnpm dev
  ```

## Espacio de trabajo y flujo de ejecución

- Este es un workspace de pnpm `11.1.2` que contiene `@amnostt/api` (`apps/api`) y `@amnostt/web` (`apps/web`).
- `packages/*` está reservado y actualmente vacío; no supongas que existen paquetes compartidos.
- El `pnpm dev` de la raíz ejecuta web y API en paralelo; usa `pnpm dev:web` o `pnpm dev:api` para una sola aplicación.
- La API inicia `AppModule`, expone el prefijo global `/api` y aplica validación global estricta (se rechazan los campos desconocidos).
- The API implements authentication, task CRUD, `GET /api/health` liveness, and `GET /api/health/ready` database readiness; the web app uses `http://localhost:3000/api` by default.
- Product documents mix implemented contracts and future plans; verify the corresponding code before describing behavior.

## Comandos y verificaciones específicas

- Root scripts include `pnpm lint`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`; root unit tests run API Jest and Web Vitest suites.
- API variants are `pnpm --filter @amnostt/api test:watch`, `test:cov`, and `test:e2e`; E2E remains explicit because it needs PostgreSQL and `DATABASE_URL`.
- Las pruebas E2E requieren PostgreSQL y `DATABASE_URL`, porque `AppModule` conecta Prisma durante el inicio.
- No existe un script independiente de typecheck: web comprueba tipos durante `build` y la compilación de la API forma parte de `nest build`.
- Solo la API tiene formatter: `pnpm --filter @amnostt/api format`; modifica archivos fuente y de pruebas. No existe formatter para la raíz ni para web.
- Antes de entregar, ejecuta:
  ```bash
  pnpm lint
  pnpm test
  pnpm build
  git diff --check
  ```

## Prisma y código generado

- La configuración de Prisma está en `apps/api/prisma.config.ts`; requiere `DATABASE_URL` y lee las migraciones desde `apps/api/prisma/migrations`.
- El código generado del cliente Prisma está bajo `apps/api/src/generated/prisma`, que está ignorado; nunca lo edites manualmente.
- Ejecuta `pnpm prisma:generate` después de cambiar el esquema o cuando falten archivos generados.
- Las migraciones versionadas están en `apps/api/prisma/migrations`; no edites manualmente `migration_lock.toml`.
- `pnpm db:down` conserva el volumen de PostgreSQL. `docker compose down -v` es destructivo y elimina los datos locales de la base de datos.
- Los auxiliares de base de datos son `pnpm db:up`, `pnpm db:down`, `pnpm db:ps`, `pnpm db:logs`, `pnpm db:migrate` y `pnpm db:studio`.

## Convenciones y límites de alcance

- El lint de API tiene información de tipos y está respaldado por Prettier; el Prettier de API usa comillas simples y comas finales.
- Web admite el alias `@/*` para `src/*`; los alias de shadcn y la configuración de componentes están en `apps/web/components.json`.
- No afirmes que autenticación, CRUD, CI, hooks, pruebas de web o paquetes compartidos están implementados; el código actual del producto es bootstrap más un healthcheck.
- Conserva `.codegraph/` y `docs/CRUD_PLAN.md`, que ya estaban sin seguimiento; no forman parte de cambios no relacionados.
