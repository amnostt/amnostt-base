# ODD: documentación web y adopción de Impeccable

## Identificación

- **Feature:** `web-docs-impeccable`
- **Tracker:** `odd/tasks/web-docs-impeccable.md`
- **Espejo Engram:** `odd/web-docs-impeccable/tasks`
- **Rama:** `docs/web-ui-contract`
- **Estado:** completado — las dos unidades locales seleccionadas fueron entregadas; la sincronización de metadatos queda pendiente del proceso padre

## Objetivo

Convertir `README.md` y `AGENTS.md` en las dos entradas generales de documentación del repositorio, retirar la documentación general obsoleta tras conservar únicamente la orientación vigente y establecer las autoridades compartidas de Impeccable sin modificar el comportamiento de `apps/web/src`.

## Problema

La orientación general está distribuida entre documentos que mezclan afirmaciones históricas, contratos implementados y planes futuros. Esto dificulta distinguir la guía humana, las invariantes para agentes y las autoridades especializadas de producto, diseño e Impeccable.

## Por qué

Una jerarquía documental explícita reduce contradicciones y carga de mantenimiento. La verificación previa de las afirmaciones de Auth, CRUD y UI evita trasladar planes o contratos no implementados a las entradas principales, mientras que una matriz de autoridades evita duplicar decisiones visuales y de producto.

## Alcance

- Verificar las afirmaciones actuales de Auth, CRUD y UI contra el código y las pruebas antes de migrarlas.
- Consolidar la guía humana vigente en `README.md`.
- Consolidar invariantes para contribuidores y agentes en `AGENTS.md`.
- Mantener `PRODUCT.md` como autoridad de intención de producto.
- Mantener `DESIGN.md` como autoridad de dirección visual.
- Instalar e inicializar Impeccable a nivel del proyecto para OpenCode y conservar sus superficies/configuración/críticas bajo `.impeccable/`.
- Retirar `docs/PROJECT.md`, `docs/AUTH.md`, `docs/CRUD.md` y `docs/UI.md` después de preservar la orientación actual verificada.
- Reparar las referencias afectadas y ejecutar las comprobaciones aplicables.

## Fuera de alcance

- Cualquier cambio de comportamiento o fuente bajo `apps/web/src`.
- Cambios de autenticación, CRUD, API, base de datos o contratos de producto no exigidos por la migración documental.
- Reescritura de `PRODUCT.md`, `DESIGN.md` o de las autoridades internas de `.impeccable/` más allá de la configuración necesaria para su adopción.
- Instalación, inicialización, commit, push, PR u operación remota durante la creación de este tracker.
- Marcar tareas de implementación como completadas sin evidencia verificable.

## Restricciones y autorización

- La creación de este tracker es el único cambio de repositorio autorizado en esta etapa.
- RDD está desactivado globalmente; la entrega posterior seguirá la política ordinaria del repositorio.
- No instalar dependencias ni herramientas en esta etapa.
- No crear commits, ramas, pushes, PRs ni ejecutar operaciones remotas.
- Mantener los artefactos técnicos en español profesional neutro, de acuerdo con la documentación existente y la solicitud autorizada.
- TDD: **N/A** para trabajo exclusivamente documental/de configuración; las comprobaciones funcionales siguen siendo obligatorias.
- El tamaño orientativo es de aproximadamente 400 líneas escritas por unidad coherente; no se debe comprimir ni omitir contenido para alcanzar ese umbral.
- La implementación futura debe preservar el comportamiento de `apps/web/src`.

## Estrategia de entrega

El usuario eligió **dos unidades locales** porque los cambios escritos superan la heurística orientativa de tamaño de revisión y el proveedor de Impeccable es un bundle generado. No hubo push ni PR; esas decisiones ordinarias permanecen a cargo del usuario.

| Unidad | Alcance | Estado de entrega | Rollback |
| --- | --- | --- | --- |
| 1 — tooling de diseño | `.gitignore`, `.impeccable/`, proveedor `.opencode/`, `PRODUCT.md` y `DESIGN.md` | Confirmada en `62ccf74` — `chore(impeccable): add project design tooling` | Revertir `62ccf74` elimina únicamente tooling y autoridades de diseño de proyecto; no afecta consolidación documental ni instalación global retenida por el usuario. |
| 2 — consolidación documental | `README.md`, `AGENTS.md`, cuatro eliminaciones en `docs/`, reparaciones históricas y este tracker | Entregada en `e0b962a` — `docs: consolidate project guidance` | Revertir `e0b962a` restaura la documentación retirada y sus referencias, sin tocar tooling de diseño de la unidad 1 ni la instalación global. |

La actualización actual del tracker será un commit separado del proceso padre para sincronizar metadatos de entrega; no constituye una tercera unidad de trabajo.

## Tareas por unidad de trabajo

### ODD-WDI-01 — Verificar afirmaciones actuales de Auth, CRUD y UI

**Estado:** completado

- [x] Leer `docs/PROJECT.md`, `docs/AUTH.md`, `docs/CRUD.md` y `docs/UI.md` y clasificar cada afirmación como implementada, verificable, futura o no respaldada.
- [x] Contrastar las afirmaciones implementadas con el código y las pruebas existentes, sin inferir capacidades a partir de planes documentales.
- [x] Registrar evidencia concreta por afirmación: archivo/símbolo, prueba o resultado de comprobación.
- [x] Separar las instrucciones que deben migrarse de los planes que deben retirarse.
- [x] Dejar constancia de cualquier afirmación no verificable para que no se publique como contrato vigente.

**Evidencia de cierre:**

| Área             | Contrato verificado y fuente                                                                                                                                                                                                                                                                                  | Decisión                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Proyecto         | Workspace pnpm con `apps/api` NestJS, `apps/web` React/Vite, PostgreSQL y Prisma; `apps/api/src/app.setup.ts` fija `/api`, validación estricta, CORS, filtro e interceptor.                                                                                                                                   | Migrar la orientación vigente a `README.md`/`AGENTS.md`; retirar `docs/PROJECT.md`.                                           |
| Registro         | `RegisterDto` acepta únicamente correo y contraseña; normaliza el correo, exige contraseña de 12–128 caracteres y `AuthService.register` deriva `name` desde el correo y asigna el rol de registro. `register.dto.spec.ts` y `auth.service.spec.ts` respaldan la validación/flujo.                            | No publicar que el nombre es un campo requerido; conservar la conducta derivada y las restricciones verificadas.              |
| Auth y seguridad | `AuthController`, `AuthService`, `AuthGuard`, `AuthTokenService`, `AuthorizationService` y sus pruebas verifican autoridad backend, validación estricta, sesiones activas, rotación/revocación de refresh, cookies `HttpOnly`/`SameSite`/`Secure`, access token en memoria web y permisos `own`/`any`.        | Migrar las invariantes de seguridad a `AGENTS.md`; retirar `docs/AUTH.md` después de conservarlas.                            |
| Respuestas API   | `ApiResponseInterceptor` envuelve respuestas definidas en `{ data }`; respuestas `undefined` (incluido `204`) no se envuelven. `ApiExceptionFilter` normaliza errores y detalles de validación.                                                                                                               | Corregir la afirmación histórica de sobre uniforme sin excepciones; documentar la excepción `204` y la forma real de errores. |
| Tasks            | `TasksController`, `TasksService`, `task-policy.ts`, DTOs y pruebas verifican CRUD de Tasks, propiedad, permisos, búsqueda sobre título/descripción, filtros declarados, ordenamiento permitido, paginación `page=1`/`limit=20` con máximo 100 y `meta`.                                                      | Migrar como contrato específico de Tasks; no afirmar que las reglas son universales para todo recurso.                        |
| UI               | `docs/UI.md` describe la implementación comprobable en `apps/web/src`, incluyendo Auth, Tasks, rutas, estado, permisos, primitives y brechas; `package.json`, `components.json`, `index.css`, rutas y pruebas respaldan la base actual. Profile, Administration y visibilidad de columnas permanecen futuras. | Migrar la guía operativa y visual verificada; retirar `docs/UI.md` sin convertir brechas o intención futura en contrato.      |
| Plan histórico   | `docs/CRUD_PLAN.md` conserva la secuencia histórica y referencias a los documentos retirados.                                                                                                                                                                                                                 | Preservar; reparar solo referencias mínimas si la búsqueda posterior demuestra que son necesarias.                            |

La clasificación se hizo leyendo los cuatro documentos objetivo y contrastando símbolos, DTOs, controladores, políticas, configuración HTTP y pruebas relevantes. Las afirmaciones obsoletas que se descartan son: nombre requerido en registro, sobre uniforme para todas las respuestas, reglas CRUD universales, administración implementada y cualquier promesa de abstracciones UI o funcionalidades marcadas como futuras.

**Límite de rollback:** revertir únicamente las notas de verificación de esta unidad; no modificar todavía las entradas generales ni eliminar documentos.

### ODD-WDI-02 — Consolidar entradas generales de documentación

**Estado:** completado

- [x] Definir en `README.md` el recorrido principal para personas usuarias y contribuidores, usando únicamente orientación verificada.
- [x] Definir en `AGENTS.md` las invariantes operativas para agentes y contribuidores, incluidos comandos y límites confirmados por el repositorio.
- [x] Diferenciar explícitamente contratos actuales, planes futuros y autoridades especializadas.
- [x] Referenciar `PRODUCT.md`, `DESIGN.md` y `.impeccable/` sin duplicar sus decisiones de autoridad.
- [x] Mantener enlaces, comandos, variables de entorno y advertencias coherentes con el estado real del workspace.
- [x] Revisar la legibilidad con estructura escaneable, señalización clara y listas de verificación donde reduzcan carga cognitiva.

**Evidencia de cierre:** `README.md` quedó como guía humana concisa con bootstrap, estado implementado, comandos, layout y mapa de autoridades. `AGENTS.md` quedó como guía operativa con jerarquía de fuentes, contratos API/Auth/Tasks, arquitectura web, límites Prisma, reglas de Impeccable y archivos protegidos. La lectura estructural confirmó 5 secciones principales en README y 10 secciones operativas en AGENTS; `git diff --check -- README.md AGENTS.md` terminó correctamente. No hubo cambios bajo `apps/web/src`.

**Evidencia de entrega — unidad 2:** `e0b962a`, `docs: consolidate project guidance`, incluye `README.md`, `AGENTS.md` y este tracker como parte de la consolidación documental entregada.

**Límite de rollback:** revertir los cambios de `README.md` y `AGENTS.md` de esta unidad sin tocar los documentos retirados ni `.impeccable/`.

### ODD-WDI-03 — Instalar, inicializar y delimitar Impeccable

**Estado:** completado

- [x] Instalar Impeccable para el alcance de proyecto de OpenCode usando el procedimiento autorizado y registrar la versión/resultado.
- [x] Inicializar los artefactos compartidos de proyecto sin alterar `apps/web/src`.
- [x] Confirmar la presencia, propósito y alcance de `.impeccable/` y cualquier configuración de proyecto generada.
- [x] Definir la matriz de autoridad: intención de producto en `PRODUCT.md`, dirección visual en `DESIGN.md`, configuración/superficies/críticas en `.impeccable/`, guía general en `README.md` y invariantes de contribución/agente en `AGENTS.md`.
- [x] Documentar qué fuente gana en caso de conflicto y qué documentos no deben volver a convertirse en autoridades generales.
- [x] Registrar cualquier archivo generado o modificación esperada antes de continuar con la retirada documental.

**Evidencia observada:** `npx impeccable help` confirmó los tokens `install` y `--providers`/`--scope`; `npx impeccable install --yes --scope=project --providers=opencode` instaló el proveedor en `.opencode/` con 53 archivos y el engine `0.1.5`. `npx impeccable --version` devolvió `4.1.0`; `.opencode/skills/impeccable/SKILL.md` declara skill `4.3.1`. `npx impeccable detect apps/web/src` terminó sin hallazgos primarios y sin modificar la fuente.

**Evidencia de entrega — unidad 1:** commit `62ccf74`, `chore(impeccable): add project design tooling`. Incluye `.gitignore`, `.impeccable/`, el proveedor `.opencode/`, `PRODUCT.md` y `DESIGN.md`. El stat observado fue 58 archivos y 19.775 inserciones; la mayor parte del volumen corresponde al bundle oficial generado del proveedor y los modos ejecutables corresponden a launchers/binarios instalados. Antes del commit, un verificador independiente dio **PASS**; `pnpm lint`, `pnpm test` (API 22 suites/143 tests; web 15 archivos/98 tests), `pnpm build`, `git diff --check`, detector `[]` y `git diff --name-only -- apps/web/src` vacío pasaron.

La ruta oficial de init se completó en el harness OpenCode activo: el proceso padre cargó el skill instalado, leyó `reference/init.md` y ejecutó `scripts/impeccable context` desde `apps/web`. El contexto resolvió `PRODUCT.md` y `DESIGN.md` raíz para el target Web, reconoció plataforma `web`, confirmó el registro de esquema de producto y devolvió `RESOLVED_CONTEXT` correctamente, sin reportar contexto de producto o diseño faltante. Los artefactos compartidos presentes son `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json` y el proveedor `.opencode/`; el detector mantiene salida `[]`.

El primer `npx impeccable install` sin flags aceptó el valor predeterminado global; se inspeccionaron sus rutas y se retiraron los manifiestos locales `.claude/settings.local.json` y `.codex/hooks.json` creados por ese intento. Tras recibir el inventario exacto y la alternativa de cuarentena, el usuario eligió explícitamente **conservar la instalación global**. La instalación global es intencional y no requiere limpieza; el proveedor de proyecto `.opencode/` sigue siendo la instalación específica de este workspace.

**Límite de rollback:** eliminar o revertir únicamente la instalación/configuración de Impeccable de proyecto y sus artefactos generados; conservar la guía documental consolidada si no depende de ellos. La instalación global queda fuera de este límite porque el usuario eligió conservarla explícitamente.

### ODD-WDI-04 — Retirar documentos supersedidos y reparar referencias

**Estado:** completado

- [x] Buscar referencias a `docs/PROJECT.md`, `docs/AUTH.md`, `docs/CRUD.md` y `docs/UI.md` en el repositorio y clasificarlas por destino.
- [x] Reparar cada referencia vigente para apuntar a `README.md`, `AGENTS.md` o a la autoridad especializada correspondiente.
- [x] Eliminar los cuatro documentos únicamente después de comprobar que la orientación actual ya está preservada.
- [x] Confirmar que no quedan enlaces rotos, instrucciones duplicadas ni referencias que presenten planes como capacidades implementadas.
- [x] Confirmar que la retirada no afecta a `PRODUCT.md`, `DESIGN.md`, `.impeccable/` ni a la fuente de la aplicación.

**Evidencia de cierre:** `docs/PROJECT.md`, `docs/AUTH.md`, `docs/CRUD.md` y `docs/UI.md` ya no existen. La búsqueda `rg -n 'docs/(PROJECT|AUTH|CRUD|UI)\\.md' --glob '!odd/tasks/**' .` no encontró referencias fuera de trackers archivados. `docs/CRUD_PLAN.md` conserva su contenido histórico con una nota de estado y referencias reparadas sin destinos retirados. El tracker `odd/tasks/web-ui-consolidation.md` quedó marcado explícitamente como histórico. La comprobación de whitespace terminó correctamente y no hubo rutas bajo `apps/web/src`.

**Evidencia de entrega — unidad 2:** `e0b962a`, `docs: consolidate project guidance`, contiene las cuatro eliminaciones, la reparación mínima de `docs/CRUD_PLAN.md` y el marcador histórico en `odd/tasks/web-ui-consolidation.md`.

**Límite de rollback:** restaurar solamente los cuatro documentos retirados y sus referencias originales si la migración no preserva una orientación vigente; no revertir autoridades especializadas ni cambios de aplicación.

### ODD-WDI-05 — Ejecutar comprobaciones enfocadas y de repositorio

**Estado:** completado

- [x] Ejecutar la comprobación estructural de `README.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md` y `.impeccable/`.
- [x] Ejecutar las comprobaciones enfocadas de instalación, inicialización, configuración y superficies de Impeccable; registrar los comandos exactos y sus resultados.
- [x] Confirmar que no se modificó `apps/web/src` ni otro ámbito fuera del autorizado.
- [x] Ejecutar `pnpm lint`.
- [x] Ejecutar `pnpm test`.
- [x] Ejecutar `pnpm build`.
- [x] Ejecutar `git diff --check`.
- [x] Registrar fallos, advertencias, dependencias de entorno y cualquier comprobación no aplicable con su justificación.

**Evidencia de cierre:** la lectura de documentos y artefactos confirmó la presencia de las autoridades raíz y `.impeccable/config.json`/`design.json`; `.opencode/` contiene el proveedor instalado. La normalización autorizada fue `pnpm --filter @amnostt/web exec prettier --write ../../README.md ../../odd/tasks/web-docs-impeccable.md` tras un primer check que detectó solo esos dos archivos; el check final quedó en verde.

- `npx impeccable detect --json apps/web/src`: **pasó**, salida `[]`.
- `pnpm lint`: **pasó**, lint de API y web completado.
- `pnpm test`: **pasó**, API `22` suites/`143` tests y web `15` archivos/`98` tests.
- `pnpm build`: **pasó**, Nest build y `tsc -b && vite build` completados.
- `git diff --check`: **pasó**.
- `git diff --name-only -- apps/web/src`: **vacío**.
- Búsqueda de referencias retiradas fuera de trackers archivados: **sin resultados**.

No hubo fallos funcionales. La advertencia repetida `npm warn Unknown user config "allowedBuilds"` pertenece al entorno de npm y no bloqueó ningún comando. La comprobación de init/context quedó completada posteriormente en el harness OpenCode activo. Existe una versión más reciente de Impeccable disponible, pero actualizarla no forma parte de esta feature.

**Límite de rollback:** no corregir automáticamente desde esta unidad; revertir únicamente ajustes de documentación/configuración identificados como causa de un fallo, preservando la evidencia del fallo.

### ODD-WDI-06 — Lectura final y evidencia de recuperación

**Estado:** completado

- [x] Leer de nuevo el tracker y todos los archivos autorizados modificados para confirmar que reflejan el estado real.
- [x] Confirmar que cada tarea anterior tiene evidencia, criterio de aceptación y límite de rollback, o permanece pendiente explícitamente.
- [x] Confirmar y documentar el estado de cualquier cambio de fuente, instalación, commit u operación remota fuera del alcance: no hubo cambios de aplicación; la unidad 1 se confirmó en `62ccf74`, la unidad 2 en `e0b962a`, no hubo push ni PR y el usuario eligió conservar explícitamente la instalación global.
- [x] Registrar el diff final, el estado de Git y la relación entre cada archivo cambiado y su unidad de trabajo.
- [x] Preparar la evidencia completa para que el proceso padre actualice el espejo Engram `odd/web-docs-impeccable/tasks`; este tracker no realiza ese espejo.

**Evidencia de cierre:** lectura final completada para `README.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json`, `.opencode/` y este tracker. Los cuatro documentos supersedidos están eliminados y `docs/CRUD_PLAN.md`/`odd/tasks/web-ui-consolidation.md` están marcados como históricos. La unidad 1 se entregó en `62ccf74` y la unidad 2 en `e0b962a`; este último registró 9 archivos modificados, 393 inserciones y 649 eliminaciones, incluidas cuatro eliminaciones documentales y la creación del tracker. Antes del commit, `git diff --check` pasó y `git diff --name-only -- apps/web/src` quedó vacío. El verificador independiente completo pasó lint, pruebas, build, detector `[]`, parseo JSON, búsqueda de referencias retiradas y comprobación de alcance protegido. No hubo push ni PR.

**Límite de rollback:** retirar únicamente el cambio documental/configuración de esta feature mediante sus límites de unidad; no revertir trabajo preexistente del branch.

## Criterios de aceptación

- [x] `README.md` y `AGENTS.md` son las dos entradas generales y no presentan afirmaciones no verificadas como contratos actuales.
- [x] La intención de producto, la dirección visual y las superficies de Impeccable conservan sus autoridades respectivas en `PRODUCT.md`, `DESIGN.md` y `.impeccable/`.
- [x] Impeccable queda instalado e inicializado para OpenCode, con su versión, artefactos y matriz de autoridad registrados; el contexto activo resolvió satisfactoriamente las autoridades raíz para el target Web.
- [x] `docs/PROJECT.md`, `docs/AUTH.md`, `docs/CRUD.md` y `docs/UI.md` se retiran únicamente después de preservar la guía vigente y reparar sus referencias.
- [x] No cambia el comportamiento de `apps/web/src`.
- [x] Las comprobaciones enfocadas y los comandos `pnpm lint`, `pnpm test`, `pnpm build` y `git diff --check` tienen resultados registrados.
- [x] La lectura final demuestra que el diff está limitado al alcance autorizado; la instalación global fuera del repositorio fue retenida explícitamente por el usuario.

## Comprobaciones aplicables

| Tipo                | Comando/acción                                                                                                         | Estado inicial |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| Estructural         | Lectura final de los documentos y artefactos autorizados                                                               | Pasó           |
| Impeccable          | Comprobaciones exactas de instalación, inicialización, configuración y superficies, registradas después de ejecutarlas | Pasó           |
| Lint                | `pnpm lint`                                                                                                            | Pasó           |
| Pruebas             | `pnpm test`                                                                                                            | Pasó           |
| Build               | `pnpm build`                                                                                                           | Pasó           |
| Integridad del diff | `git diff --check`                                                                                                     | Pasó           |

## Progreso y evidencia

- **Setup del tracker:** completo. Se creó únicamente `odd/tasks/web-docs-impeccable.md`.
- **Implementación y entrega:** `ODD-WDI-01` a `ODD-WDI-06` completados con evidencia funcional. Las dos unidades locales se entregaron en `62ccf74` y `e0b962a`.
- **Cambios de aplicación:** ninguno autorizado ni realizado.
- **Instalación de Impeccable:** proveedor OpenCode instalado a nivel de proyecto en `.opencode/`; la instalación global de la primera ejecución se conserva por decisión explícita del usuario.
- **Commits, push y PR:** unidad 1 `62ccf74`; unidad 2 `e0b962a`; no hubo push ni PR.
- **Espejo Engram:** la sincronización final queda pendiente del proceso padre después de leer este tracker completo.

## Siguiente paso

No queda trabajo de implementación requerido. El proceso padre debe sincronizar el espejo Engram final tras esta lectura y puede crear un commit separado de sincronización de metadatos para este tracker; no es una tercera unidad. Push o PR son decisiones opcionales y propiedad del usuario.

## Modo TDD

**N/A — documentación y configuración.** No se crea una prueba unitaria específica para el tracker, pero las comprobaciones funcionales y de repositorio indicadas en `ODD-WDI-05` siguen siendo obligatorias para la implementación posterior.

## Límite de rollback global

La recuperación se revierte por unidad de trabajo: la unidad 1 mediante `62ccf74`, que elimina únicamente `.gitignore`, `.impeccable/`, `.opencode/`, `PRODUCT.md` y `DESIGN.md`; y la unidad 2 mediante `e0b962a`, que restaura la consolidación documental, las cuatro eliminaciones, las reparaciones históricas y el tracker. La posterior sincronización de metadatos del tracker se revierte de forma independiente y no crea una tercera unidad. No se revierten archivos preexistentes ni se modifica `apps/web/src`. La instalación global de Impeccable está fuera del rollback porque el usuario eligió conservarla explícitamente.
