# Guía de agentes y contribuidores

Esta guía establece cómo contribuir sin confundir intención, documentación y comportamiento vigente. Verifica siempre el código y las pruebas antes de describir una capacidad.

## Autoridad y alcance

1. El código y las pruebas determinan el comportamiento real.
2. Esta guía establece límites de contribución y comandos operativos.
3. [`README.md`](README.md) es la única entrada general del repositorio.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) describe la arquitectura y los flujos implementados; úsalo como referencia técnica, no dupliques aquí su contenido.
5. [`PRODUCT.md`](PRODUCT.md) registra contexto e intención de producto para Impeccable; [`DESIGN.md`](DESIGN.md) contiene una dirección visual provisional.
6. `.impeccable/` contiene artefactos compartidos de la herramienta.

Si las fuentes discrepan, prevalecen código y pruebas. Registra la discrepancia y verifica antes de editar. Una intención de producto, dirección visual o recomendación de Impeccable no se convierte por sí sola en contrato.

## Workspace y bootstrap

- El workspace usa Node.js, pnpm y Docker Compose; el repositorio no fija una versión de Node.
- Respeta `packageManager` y el lockfile:
  ```bash
  corepack enable
  pnpm install --frozen-lockfile
  ```
- Copia `.env.example`, `apps/api/.env.example` y `apps/web/.env.example` localmente; no versiones los archivos resultantes.
- `apps/api/.env.example` no incluye `DATABASE_URL`; configúrala localmente antes de ejecutar Prisma o iniciar la API.
- Paquetes activos: `@amnostt/api` (`apps/api`) y `@amnostt/web` (`apps/web`). `packages/*` está reservado y vacío.

Bootstrap reproducible:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:down` conserva el volumen. `docker compose down -v` elimina datos locales y requiere autorización explícita.

## Verificación

- `pnpm lint`: lint de web y API.
- `pnpm test`: Jest de API y Vitest de web.
- `pnpm test:e2e`: E2E de API, separado porque requiere PostgreSQL y `DATABASE_URL`.
- `pnpm build`: `tsc -b`/Vite para web y compilación Nest de API; no hay typecheck independiente.
- `pnpm --filter @amnostt/api format`: formatter mutante de fuentes y pruebas de API.
- `pnpm --filter @amnostt/web format:check`: comprobación Prettier no mutante de web.

Gate habitual:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

Normaliza solo Markdown y configuración para los que el repositorio ofrece soporte seguro. Después, usa únicamente comprobaciones no mutantes. No ejecutes formatters mutantes sobre fuentes instaladas de Impeccable.

## Límites de cambio

- El backend es la autoridad de identidad, sesión, permisos y propiedad; la UI no sustituye autorización.
- No afirmes capacidades futuras —incluyendo administración, Profile, CI, hooks, paquetes compartidos o abstracciones— sin evidencia actual.
- No edites manualmente `apps/api/src/generated/prisma`: es generado e ignorado. `apps/api/prisma.config.ts` requiere `DATABASE_URL`; ejecuta `pnpm prisma:generate` solo tras cambios autorizados de esquema o si faltan artefactos. Las migraciones versionadas sí son fuente; no edites `migration_lock.toml` manualmente.
- Preserva el comportamiento y copy visible comprobados por pruebas al editar documentación o configuración; no modifiques la UI como efecto lateral.
- Conserva `.codegraph/` y los trackers históricos. No borres artefactos existentes fuera del alcance autorizado.
- No marques tareas del tracker sin evidencia observada. Antes de entregar, comprueba alcance, enlaces, rutas documentadas y comandos del gate.

## Impeccable

- Se usa la instalación global; no reinstales, actualices ni mantengas un proveedor local bajo `.opencode/`.
- La inicialización oficial se intenta mediante `/impeccable init` en el harness. Si no puede invocarse y no hay equivalente documentado, registra la inicialización como parcial; conserva solo artefactos confirmados.
- Versiona las autoridades compartidas de configuración, dirección, superficies y críticas que genere la herramienta. Ignora solo estado local efímero conforme al bloque marcador upstream.
- Mantén la separación: `PRODUCT.md` para contexto de producto, `DESIGN.md` para dirección visual y `.impeccable/` para configuración, superficies y críticas. No sincronices ni regeneres artefactos de la herramienta como efecto lateral de una edición documental.
- Si una recomendación o crítica contradice código y pruebas, documenta el conflicto y solicita una decisión explícita antes de implementarla.
