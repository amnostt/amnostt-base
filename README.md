# Amnostt Base

Base reutilizable para proyectos con un frontend React/Vite, una API NestJS y
PostgreSQL gestionado mediante Prisma.

## Requisitos

- Node.js compatible con las versiones declaradas en el workspace.
- Corepack habilitado.
- pnpm `11.1.2`.
- Docker Desktop, o Docker Engine con Docker Compose.

Comprueba las herramientas antes de comenzar:

```bash
node --version
corepack --version
docker --version
docker compose version
```

## Instalación rápida

Desde la raíz del repositorio:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Los archivos `.env` son locales y no deben subirse al repositorio. Los archivos
`.env.example` contienen únicamente valores de ejemplo y sí están versionados.

## Configuración

La configuración está separada por aplicación:

| Archivo | Uso |
| --- | --- |
| `.env` | Credenciales, nombre, puerto y conexión local de PostgreSQL |
| `apps/api/.env` | Puerto, origen CORS y `DATABASE_URL` de NestJS/Prisma |
| `apps/web/.env` | URL pública de la API mediante `VITE_API_URL` |

Conserva los puertos locales definidos en los ejemplos salvo que exista un
conflicto en tu máquina:

| Servicio | URL o puerto |
| --- | --- |
| Frontend Vite | `http://localhost:5173` |
| API NestJS | `http://localhost:3000` |
| Healthcheck de la API | `http://localhost:3000/api/health` |
| PostgreSQL | `localhost:5432` |

Si cambias el puerto de PostgreSQL, actualiza también el puerto de conexión en
`apps/api/.env`. Si cambias el puerto de la API o del frontend, actualiza
`VITE_API_URL` y `CORS_ORIGIN` según corresponda.

## Base de datos

Inicia PostgreSQL y comprueba su estado:

```bash
pnpm db:up
pnpm db:ps
```

Aplica las migraciones de Prisma:

```bash
pnpm db:migrate
```

El comando `db:migrate` crea o actualiza la estructura de la base de datos a
partir del schema y de las migraciones versionadas en
`apps/api/prisma/migrations`.

Comandos útiles:

```bash
pnpm db:logs
pnpm prisma:generate
pnpm db:studio
pnpm db:down
```

`pnpm db:down` detiene los contenedores, pero conserva el volumen de datos.

## Desarrollo

Con PostgreSQL iniciado y las migraciones aplicadas, levanta el frontend y la
API desde la raíz:

```bash
pnpm dev
```

También puedes iniciar cada aplicación por separado:

```bash
pnpm dev:web
pnpm dev:api
```

Abre `http://localhost:5173` en el navegador. La pantalla mínima muestra el
estado de comunicación con `GET /api/health`; el estado esperado es `online`.

## Verificación

Ejecuta las comprobaciones desde la raíz:

```bash
pnpm lint
pnpm test
pnpm build
git diff --check
```

La API también dispone de pruebas end-to-end en `apps/api/test`:

```bash
pnpm --filter @amnostt/api test:e2e
```

La respuesta del healthcheck debe ser `200` con este cuerpo:

```json
{"status":"ok"}
```

## Prueba limpia desde cero

Para comprobar que el proyecto puede prepararse sin depender de instalaciones
anteriores:

```bash
rm -rf node_modules apps/api/node_modules apps/web/node_modules
rm -rf apps/api/dist apps/web/dist
pnpm install --frozen-lockfile
pnpm db:up
pnpm db:migrate
pnpm lint
pnpm test
pnpm build
```

Después, ejecuta `pnpm dev` y verifica manualmente:

- La web carga en `http://localhost:5173`.
- La API responde en `http://localhost:3000/api/health`.
- PostgreSQL aparece como `healthy` con `pnpm db:ps`.
- La web muestra `API status: online`.

## Reset de la base de datos

El siguiente comando es destructivo: detiene PostgreSQL y elimina su volumen
nombrado. Se perderán todos los datos locales:

```bash
docker compose down -v
```

Para reconstruir una base vacía después del reset:

```bash
pnpm db:up
pnpm db:migrate
```

No uses `docker compose down -v` si necesitas conservar los datos locales.

## Estructura

```text
.
├── apps/
│   ├── api/                  # API REST NestJS y Prisma
│   └── web/                  # Frontend React con Vite
├── docs/                     # Decisiones y alcance del proyecto
├── compose.yaml              # PostgreSQL local
├── package.json              # Scripts coordinados desde la raíz
├── pnpm-lock.yaml            # Lockfile único del workspace
└── pnpm-workspace.yaml       # Configuración del workspace pnpm
```

## Scripts raíz

| Script | Propósito |
| --- | --- |
| `pnpm dev` | Inicia web y API en paralelo |
| `pnpm dev:web` | Inicia únicamente el frontend |
| `pnpm dev:api` | Inicia únicamente la API |
| `pnpm build` | Compila web y API |
| `pnpm lint` | Ejecuta ESLint en web y API |
| `pnpm test` | Ejecuta las pruebas unitarias de la API |
| `pnpm db:up` | Inicia PostgreSQL |
| `pnpm db:down` | Detiene PostgreSQL sin eliminar datos |
| `pnpm db:ps` | Muestra el estado de los servicios |
| `pnpm db:logs` | Muestra los últimos logs de PostgreSQL |
| `pnpm prisma:generate` | Regenera el cliente Prisma |
| `pnpm db:migrate` | Crea o aplica migraciones |
| `pnpm db:studio` | Abre Prisma Studio |

## Próximo alcance

El bootstrap actual prepara la infraestructura, pero todavía no implementa
autenticación, usuarios ni un CRUD de negocio. Las decisiones iniciales de
producto y arquitectura están documentadas en `docs/PROJECT.md`, `docs/AUTH.md`
y `docs/CRUD.md`.
