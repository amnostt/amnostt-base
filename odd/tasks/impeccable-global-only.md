# ODD: recuperación de Impeccable solo global

## Identificación

- **Feature:** `impeccable-global-only`
- **Tracker:** `odd/tasks/impeccable-global-only.md`
- **Espejo Engram:** `odd/impeccable-global-only/tasks`
- **Rama:** `docs/web-ui-contract`
- **Estado:** completado.

## Objetivo

Retirar exclusivamente el proveedor local de Impeccable y operar con la instalación global existente, sin perder el contexto durable del proyecto.

## Problema

El workspace conserva un proveedor OpenCode específico del proyecto que duplica la instalación global autorizada. Mantener ambos permite resoluciones de skill ambiguas y actualizaciones locales innecesarias.

## Por qué

Una única fuente global para el proveedor evita divergencia operativa, mientras que `PRODUCT.md`, `DESIGN.md` y `.impeccable/` preservan el contexto compartido que el proveedor necesita para trabajar sobre este proyecto.

## Alcance autorizado

- Eliminar solo `.opencode/commands/impeccable.md` y `.opencode/skills/impeccable/`.
- Cambiar `AGENTS.md` de guía de proveedor de proyecto a uso exclusivo del proveedor global.
- Regenerar `.atl/skill-registry.md` y actualizar el registro de Engram para que `impeccable` resuelva a `~/Library/Application Support/orca/opencode-hooks/shared/skills/impeccable/`.
- Verificar la resolución global, la ausencia del proveedor local, la conservación del contexto durable y el alcance del diff.

## Fuera de alcance

- Eliminar, actualizar, instalar o modificar la instalación global de Impeccable.
- Eliminar `.opencode/.gitignore`, `.opencode/node_modules/`, `.opencode/package.json` o `.opencode/package-lock.json`.
- Modificar `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json` o las reglas upstream de `.gitignore`.
- Cambiar fuentes de aplicación, API, pruebas, esquema, migraciones o comportamiento en runtime.
- Crear commits, push, PRs, delegaciones, instaladores, actualizadores, formatters o pruebas no autorizados.

## Restricciones

- La CLI oficial no ofrece un comando de desinstalación de proveedor; la limpieza futura se limita a la eliminación de las rutas locales autorizadas.
- `.atl/` es estado operativo ignorado, pero su registro debe actualizarse después de retirar el proveedor.
- No se marca una tarea de implementación como completada sin evidencia observada.
- TDD: **N/A**; se trata de configuración y documentación, con comprobaciones enfocadas obligatorias.

## Línea base de estado sucio

Antes de este tracker, el worktree está sucio **solo** por una actualización de Impeccable ejecutada por el usuario bajo `.opencode/skills/impeccable/`: 16 archivos modificados y 6 archivos nuevos observados. Esos cambios pertenecen al proveedor local, son trabajo del usuario y quedan explícitamente supersedidos por la solicitud autorizada de retirar dicho proveedor. Debe preservarse todo trabajo no relacionado.

## Tareas estables

### ODD-IGO-01 — Retirar el proveedor local acotado

**Estado:** completado

- [x] Eliminar únicamente `.opencode/commands/impeccable.md` y `.opencode/skills/impeccable/`.
- [x] Confirmar que los archivos de soporte no relacionados de `.opencode/` permanecen presentes.

**Evidencia requerida:** listado de rutas eliminadas y de archivos de soporte conservados.

### ODD-IGO-02 — Actualizar la guía operativa

**Estado:** completado

- [x] Actualizar `AGENTS.md` para indicar uso exclusivo del proveedor global de Impeccable.
- [x] Preservar la matriz de autoridades: intención en `PRODUCT.md`, dirección visual en `DESIGN.md` y configuración/superficies/críticas en `.impeccable/`.

**Evidencia requerida:** lectura del bloque actualizado de `AGENTS.md` y confirmación de que las autoridades durables no cambiaron.

### ODD-IGO-03 — Regenerar las resoluciones operativas

**Estado:** completado

- [x] Regenerar `.atl/skill-registry.md` después de retirar el proveedor local.
- [x] Actualizar el registro de Engram para que `impeccable` resuelva globalmente.
- [x] Confirmar una ruta global existente según la precedencia real del registro: `/Users/vanderidme/.agents/skills/impeccable/SKILL.md`.

**Evidencia observada:** el registro tiene 16 skills indexadas y marca `impeccable` como `user` en `/Users/vanderidme/.agents/skills/impeccable/SKILL.md`. Esa ruta global precede a la copia OpenCode-global existente en `/Users/vanderidme/Library/Application Support/orca/opencode-hooks/shared/skills/impeccable/SKILL.md`; por ello no se fuerza la ruta histórica esperada. Engram guardó `Refresh global skill registry` con `topic_key: skill-registry` y sus relaciones pendientes se resolvieron.

### ODD-IGO-04 — Verificar recuperación y alcance

**Estado:** completado

- [x] Verificar que la skill global de Impeccable carga y que no quedan rutas locales del proveedor.
- [x] Confirmar la presencia y conservación de `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json` y las reglas upstream de `.gitignore`.
- [x] Confirmar que no se modificó ninguna fuente de aplicación.
- [x] Ejecutar `git diff --check` y las comprobaciones documentales aplicables sin formatter: lectura de enlaces/rutas documentadas y revisión de alcance del diff.

**Evidencia requerida:** resultados exactos de cada comprobación, incluidas las no aplicables y su justificación.

### ODD-IGO-05 — Registrar entrega y recuperación

**Estado:** completado.

- [x] Registrar la identidad del commit de unidad de trabajo y la evidencia de rollback.
- [x] Confirmar que no hubo push ni PR.

**Evidencia observada:** commit de unidad de trabajo `837fffa` (`chore(impeccable): use global provider`), con 55 archivos cambiados, 142 inserciones y 19,429 eliminaciones. Todos los archivos eliminados pertenecían al comando y bundle de skill Impeccable local. El commit incluye la guía global de `AGENTS.md` y este tracker. El verificador independiente emitió PASS para contexto global, registro, contexto durable, alcance, Prettier e integridad del diff. No hubo push ni PR.

## Criterios de aceptación

- [x] No existen `.opencode/commands/impeccable.md` ni `.opencode/skills/impeccable/`.
- [x] La instalación global se conserva sin cambios y `impeccable` resuelve a su ruta global.
- [x] `AGENTS.md` describe la operación global sin presentar el proveedor local como instalado.
- [x] `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`, `.impeccable/design.json` y las reglas upstream de `.gitignore` permanecen intactos.
- [x] Los archivos de soporte no relacionados de `.opencode/` permanecen intactos.
- [x] No hay cambios en fuentes de aplicación, API, pruebas, esquema o migraciones.
- [x] `git diff --check` y las comprobaciones documentales aplicables tienen evidencia registrada.
- [x] La entrega incluye evidencia de commit y rollback, sin push ni PR.

## Comprobaciones exactas

| Tipo             | Comando o acción                                                                              | Estado inicial                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Resolución       | `/Users/vanderidme/.agents/skills/impeccable/scripts/impeccable context` desde `apps/web`     | PASS: `RESOLVED_CONTEXT`, rutas `../../PRODUCT.md` y `../../DESIGN.md`, plataforma `web`                                |
| Ausencia local   | Comprobar que no existen `.opencode/commands/impeccable.md` ni `.opencode/skills/impeccable/` | PASS: se retiraron los directorios vacíos del proveedor y los padres vacíos `.opencode/skills/` y `.opencode/commands/` |
| Contexto durable | Comprobar presencia e integridad de las cuatro autoridades y reglas indicadas                 | PASS: presentes, sin diff; bloque `# impeccable-ignore-start/end` presente y `.impeccable/review/` ignorado             |
| Alcance          | Revisar `git diff --name-only` para excluir fuentes y rutas protegidas                        | PASS: sin rutas bajo `apps/web/src`, `apps/api/src`, `apps/api/prisma` o `apps/api/test`                                |
| Documentación    | Leer enlaces/rutas afectados y el bloque actualizado de `AGENTS.md`, sin formatter            | PASS: matriz de autoridades preservada; no quedan claims activos de proveedor local                                     |
| Integridad       | `git diff --check`                                                                            | PASS                                                                                                                    |
| Formato          | `pnpm --filter @amnostt/web exec prettier --write ../../odd/tasks/impeccable-global-only.md`  | PASS: aplicado solo a este tracker                                                                                      |

## Progreso y evidencia

- **Setup del tracker:** completo; este es el único archivo creado en esta etapa.
- **Implementación:** `ODD-IGO-01` a `ODD-IGO-05` completados mediante el commit `837fffa` (`chore(impeccable): use global provider`).
- **Operaciones realizadas:** se retiraron exclusivamente las rutas locales autorizadas, incluidos los directorios vacíos remanentes y sus padres vacíos, se actualizó la guía, se regeneró el registro, se formateó únicamente este tracker y se ejecutaron comprobaciones no mutantes. El commit de unidad registró 55 archivos cambiados, 142 inserciones y 19,429 eliminaciones.
- **Operaciones no realizadas:** no se instalaron ni actualizaron proveedores, no se ejecutaron pruebas, push, PRs ni delegaciones.
- **Espejo Engram:** el registro `skill-registry` se guardó correctamente; el espejo del tracker permanece pendiente de sincronización del proceso padre después de la lectura.
- **Metadata posterior:** un commit posterior del proceso padre que sincronice solo metadata del tracker será independiente y no constituye una segunda unidad de trabajo.

## Siguiente paso

No queda implementación requerida. Push y PR son decisiones opcionales del usuario. Un commit posterior del proceso padre para metadata del tracker no cambia la unidad de trabajo. El rollback de `837fffa` restaura solo las rutas locales retiradas, `AGENTS.md`, `.atl/skill-registry.md` y este tracker.

## Modo TDD

**N/A — configuración y documentación.** La implementación debe ejecutar y registrar las comprobaciones de recuperación y alcance definidas arriba.

## Límite de rollback

El rollback de `837fffa` restaura **solo** `.opencode/commands/impeccable.md`, `.opencode/skills/impeccable/`, la guía correspondiente de `AGENTS.md`, `.atl/skill-registry.md` y este tracker si fuera necesario. Nunca elimina ni altera la instalación global de Impeccable, `PRODUCT.md`, `DESIGN.md`, `.impeccable/`, las reglas upstream de `.gitignore` ni archivos de soporte no relacionados dentro de `.opencode/`. Un commit posterior que sincronice solo metadata del tracker es independiente y no forma parte de esta unidad de trabajo.
