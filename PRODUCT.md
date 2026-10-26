# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Completa este apartado para el proyecto derivado: define su audiencia y necesidades con evidencia propia. La aplicación de referencia de esta base incluye personas autenticadas que gestionan tareas propias o autorizadas.

## Product Purpose

Amnostt Base es una base reutilizable para aplicaciones web. Su referencia implementada combina autenticación y sesiones seguras con Tasks como ejemplo de gestión autorizada. Los proyectos derivados deben describir aquí su propósito específico sin asumir que las áreas futuras de la base ya existen.

## Operating Context

Workspace con pnpm, API NestJS, web Angular con Zard UI en `apps/web` y PostgreSQL mediante Prisma. La web implementa login, restauración de sesión, logout, navegación protegida y gestión de tareas autorizadas; el backend conserva la autoridad de identidad, permisos y propiedad. Para el estado real de Auth, Tasks, seguridad y sus límites, consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Brand Commitments

El nombre de esta base es Amnostt Base. La documentación general usa español profesional neutro y la guía técnica de la web está en inglés. La interfaz Angular y sus etiquetas de accesibilidad están en español; los proyectos derivados deben decidir explícitamente cualquier cambio de idioma o marca.
