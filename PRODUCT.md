# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personas autenticadas que necesitan gestionar tareas propias o autorizadas según permisos vigentes. El workspace también sirve a contribuidores que validan una base reutilizable de aplicación con una API, una interfaz web y PostgreSQL.

## Product Purpose

Amnostt Base ofrece una base reproducible para aplicaciones web con identidad, sesiones seguras, autorización explícita y un CRUD de referencia sobre Tasks. El éxito actual consiste en que una persona pueda autenticarse, conservar una sesión válida y gestionar tareas sin que la UI sustituya las decisiones del backend.

## Positioning

La base prioriza contratos verificables y límites explícitos: las reglas de identidad, sesión y propiedad se resuelven en el backend, mientras que la web facilita navegación, formularios y estados de trabajo.

## Operating Context

El workspace se ejecuta con pnpm, Node.js, Docker Compose, una API NestJS, una aplicación React/Vite y PostgreSQL mediante Prisma. El desarrollo local requiere configurar variables de entorno, aplicar migraciones y cargar datos de seed antes de usar la API completa.

## Capabilities and Constraints

- Auth implementa registro con correo y contraseña, login, refresh, logout, `/auth/me` y cambio de contraseña.
- Tasks implementa listado, consulta, creación, actualización y eliminación con permisos `own`/`any`, búsqueda, filtros, ordenamiento y paginación.
- La API expone liveness y readiness; readiness depende de PostgreSQL.
- El registro deriva el nombre desde el correo y no acepta un campo `name`.
- La UI no es una frontera de seguridad; el backend comprueba identidad, sesión, permisos y propiedad.
- Las superficies de administración de usuarios, roles y permisos, Profile y otras áreas futuras no se presentan como capacidades implementadas.

## Brand Commitments

El nombre del producto es Amnostt Base. La documentación técnica usa español profesional neutro; el copy visible actual de la aplicación permanece en inglés salvo una decisión explícita posterior.

## Evidence on Hand

- API y pruebas: `apps/api/src`, `apps/api/test` y pruebas unitarias junto a los módulos.
- Web y pruebas: `apps/web/src` y sus pruebas Vitest.
- Configuración visual vigente: `apps/web/components.json` y `apps/web/src/index.css`.
- Guías operativas: `README.md` y `AGENTS.md`.

No se deben inventar usuarios, clientes, métricas, precios, testimonios ni capacidades no presentes en estas fuentes.

## Product Principles

1. El backend es la autoridad definitiva de identidad, sesión y autorización.
2. Una solicitud no se satisface silenciosamente con datos recortados, ignorados o sustituidos.
3. Las reglas específicas de Tasks no se convierten en un framework universal sin evidencia de un segundo recurso.
4. La documentación distingue comportamiento implementado, brechas conocidas e intención futura.

## Accessibility & Inclusion

La interfaz debe conservar semántica, navegación por teclado, estados comunicados y comportamiento responsive comprobable. Las pruebas existentes y las comprobaciones de Impeccable son evidencia de apoyo, no sustituyen la revisión de la experiencia real.

## Explicit Non-Capabilities and Future Areas

- Administración de usuarios, roles y permisos.
- Superficie Profile.
- Recuperación de contraseña por correo.
- Abstracciones UI compartidas que todavía aparecen como brechas.
- Cambios de copy o de idioma de la aplicación.
