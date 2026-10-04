# Plan de implementación del CRUD de referencia

> **Estado histórico:** este plan conserva el orden de trabajo original y no es una guía vigente. Las referencias a los contratos de Auth y CRUD designan documentación histórica retirada; consulta `README.md` y `AGENTS.md` para el estado actual.

Este plan establece el orden de trabajo para construir el CRUD de tareas desde la base de datos hasta el frontend. El objetivo es avanzar mediante unidades pequeñas y completas, evitando implementar capas aisladas o abstraer antes de conocer el patrón real.

## 1. Cerrar el contrato mínimo de autenticación

Completar en el contrato histórico de autenticación únicamente las decisiones necesarias para establecer una identidad confiable:

- Modelos `User`, `Role`, `Permission` y `Session`.
- Endpoints de login, refresh, logout y `/auth/me`.
- Forma del principal autenticado.
- Permisos con alcance `own` y `any`.
- Revocación de sesiones y tratamiento de cuentas desactivadas.

La administración de usuarios y roles, la recuperación de contraseña y otras funciones avanzadas quedan fuera de esta etapa.

## 2. Implementar la identidad en la base de datos

- Crear los modelos Prisma.
- Generar una migración inicial reproducible.
- Crear el rol y los permisos predeterminados.
- Agregar un seed con usuarios de prueba y permisos diferentes.

**Criterio de salida:** existen al menos dos usuarios persistidos con permisos distintos y relaciones válidas.

## 3. Implementar Auth Foundation en la API

- Implementar login, refresh y logout.
- Incorporar el guard de autenticación.
- Construir `currentUser` exclusivamente desde información validada por el backend.
- Verificar que la cuenta y la sesión estén activas.
- Resolver y evaluar los permisos efectivos.

**Criterio de salida:** una sesión revocada o una cuenta desactivada no puede acceder a rutas protegidas.

## 4. Implementar la sesión mínima en el frontend

- Crear la pantalla de login.
- Mantener el access token únicamente en memoria.
- Renovar la sesión mediante la cookie del refresh token.
- Cargar la identidad actual mediante `/auth/me`.
- Proteger rutas y permitir cerrar sesión.

La administración de usuarios, roles y permisos no forma parte de esta etapa.

## 5. Cerrar el contrato de Task

Completar el contrato histórico de Task con:

- Endpoints y formatos de respuesta.
- Sintaxis de query params.
- Formato común de errores.
- Permisos `tasks:*:own` y `tasks:*:any`.
- Reglas para aceptar o ignorar `ownerId`.
- Valores predeterminados y límites de paginación.

## 6. Implementar Task mediante cortes verticales

Construir una operación completa por unidad de trabajo:

1. Listar y consultar tareas.
2. Crear una tarea.
3. Editar una tarea.
4. Eliminar una tarea.
5. Incorporar búsqueda, filtros, ordenamiento y paginación.

Cada unidad debe incluir persistencia, API, frontend y pruebas. No se debe terminar una capa completa antes de integrar las demás.

## 7. Extraer la infraestructura reutilizable

Después de completar el CRUD de tareas, identificar y extraer únicamente los patrones demostrados:

- Respuestas paginadas.
- Cliente HTTP y manejo de errores.
- Tabla, filtros y estados de carga.
- Sincronización con parámetros de la URL.
- Panel lateral y confirmaciones.
- Primitivas para evaluar permisos.

Los DTO, políticas, consultas, formularios, columnas y validaciones deben permanecer específicos de cada recurso. El segundo CRUD servirá para validar qué abstracciones son realmente reutilizables.

## Próximo paso

El siguiente paso histórico era cerrar el contrato mínimo de autenticación. El CRUD y la administración avanzada de usuarios debían esperar hasta contar con una identidad confiable.
