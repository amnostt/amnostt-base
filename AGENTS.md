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
- Copia `.env.example` y `apps/api/.env.example` localmente; no versiones los archivos resultantes. La web Angular usa rutas relativas `/api` y el proxy de desarrollo en `apps/web/src/proxy.conf.json`, no un archivo `.env` web.
- `apps/api/.env.example` no incluye `DATABASE_URL`; configúrala localmente antes de ejecutar Prisma o iniciar la API.
- Paquetes activos: `@amnostt/api` (`apps/api`, NestJS) y `@amnostt/web` (`apps/web`, Angular con Zard UI). `packages/*` está reservado y vacío.

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
- `pnpm test`: Jest de API y Vitest mediante Angular CLI para web. Usa `CI=true pnpm test` en automatización; para web sin watch, `pnpm --filter @amnostt/web test --watch=false`.
- `pnpm test:e2e`: E2E de API, separado porque requiere PostgreSQL y `DATABASE_URL`.
- `pnpm build`: compilación Angular para web y Nest para API; no hay typecheck independiente.
- `pnpm --filter @amnostt/api format`: formatter mutante de fuentes y pruebas de API.
- `pnpm --filter @amnostt/web exec prettier --check <rutas>`: comprobación Prettier no mutante de las rutas indicadas; no existe un script web `format:check`.

Gate habitual:

```bash
pnpm lint
CI=true pnpm test
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

## Zard para Angular

- La skill oficial `zard` está instalada a nivel de proyecto en `.agents/skills/zard/`; úsala para la UI Angular de `apps/web`, no para la API.
- Antes de trabajar con Zard, carga la skill y lee `apps/web/components.json`. Ejecuta los comandos `pnpm dlx zard-cli ...` desde `apps/web`; la ausencia de `components.json` en la raíz del monorepo no requiere ejecutar `init`.
- Reutiliza los componentes instalados en `apps/web/src/app/shared/zard/` y consulta su API real. Si la skill o el registro upstream discrepan del código instalado y sus pruebas, documenta la diferencia antes de cambiar comportamiento.
- La instalación de la skill no autoriza migraciones, reinicialización, cambios de dependencias ni sobrescrituras con `--overwrite`. No ejecutes `zard-migration` ni reemplaces componentes existentes sin autorización explícita.
- Conserva la skill oficial sin modificaciones locales y versiona `skills-lock.json` junto con sus archivos. Para reinstalarla desde la raíz: `pnpm dlx skills add https://github.com/zard-ui/zardui --skill zard --agent opencode`.
- El MCP `zard-ui` se configura en `opencode.json` para este proyecto, con `zard-mcp@1.1.0` y directorio de trabajo `apps/web`. Solo se permiten las nueve herramientas de consulta; `install-component` y cualquier herramienta nueva quedan bloqueadas por defecto. Verifica la conexión con `opencode mcp list` y contrasta las respuestas upstream con los componentes locales; no cambies los permisos ni actualices la versión como efecto lateral de una tarea de UI.

## Impeccable

- Se usa la instalación global; no reinstales, actualices ni mantengas un proveedor local bajo `.opencode/`.
- La inicialización oficial se intenta mediante `/impeccable init` en el harness. Si no puede invocarse y no hay equivalente documentado, registra la inicialización como parcial; conserva solo artefactos confirmados.
- Versiona las autoridades compartidas de configuración, dirección, superficies y críticas que genere la herramienta. Ignora solo estado local efímero conforme al bloque marcador upstream.
- Mantén la separación: `PRODUCT.md` para contexto de producto, `DESIGN.md` para dirección visual y `.impeccable/` para configuración, superficies y críticas. No sincronices ni regeneres artefactos de la herramienta como efecto lateral de una edición documental.
- Si una recomendación o crítica contradice código y pruebas, documenta el conflicto y solicita una decisión explícita antes de implementarla.
