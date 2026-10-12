---
name: Amnostt Base
description: Sistema visual neutral para operar una base web de autenticación y tareas.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.97 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.708 0 0)"
  sidebar: "oklch(0.985 0 0)"
typography:
  body:
    fontFamily: "Inter Variable, sans-serif"
  label:
    fontFamily: "Inter Variable, sans-serif"
rounded:
  md: "0.625rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.background}"
    rounded: "{rounded.md}"
---

# Dirección visual: Amnostt Base

## Baseline replaceable

Esta es una referencia visual provisional, no una especificación de arquitectura ni un contrato de runtime. Describe el lenguaje visual presente en la base: neutral, orientado a operación y apoyado en tokens semánticos. Un proyecto derivado puede reemplazar esta dirección cuando defina su marca y sus necesidades; debe verificar cualquier afirmación visual contra la implementación vigente.

## Principios actuales

- Priorizar jerarquía legible, estados comprensibles, foco visible y comportamiento responsive.
- Preferir roles de color semánticos y las primitivas compartidas existentes a estilos aislados.
- Mantener consistencia entre navegación, formularios y contenido operativo.
- Tratar recomendaciones y críticas de Impeccable como guía, no como prueba de capacidades implementadas.

Los valores estructurados del encabezado describen el baseline visual de esta base. No implican que cada token o componente se use en todas las pantallas. Para contexto de producto, consulta [`PRODUCT.md`](PRODUCT.md); para arquitectura y comportamiento, consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
