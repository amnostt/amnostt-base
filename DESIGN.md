---
name: Amnostt Base
description: Sistema visual neutral para operar una base web de autenticación y tareas.
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.129 0.042 264.695)"
  primary: "oklch(0.208 0.042 265.755)"
  primary-foreground: "oklch(0.984 0.003 247.858)"
  secondary: "oklch(0.968 0.007 247.896)"
  muted: "oklch(0.968 0.007 247.896)"
  muted-foreground: "oklch(0.554 0.046 257.417)"
  destructive: "oklch(0.577 0.245 27.325)"
  border: "oklch(0.929 0.013 255.508)"
  input: "oklch(0.929 0.013 255.508)"
  ring: "oklch(0.704 0.04 256.788)"
  sidebar: "oklch(0.984 0.003 247.858)"
typography:
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
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

Los valores estructurados del encabezado reflejan los tokens claros de `apps/web/src/styles.css` y la familia sans-serif de sistema predeterminada de Tailwind; la app no carga Inter Variable. No implican que cada token o componente se use en todas las pantallas. Para contexto de producto, consulta [`PRODUCT.md`](PRODUCT.md); para arquitectura y comportamiento, consulta [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Implementación Angular

La aplicación web vigente usa Zard UI con el tema Slate y Tailwind CSS, según `apps/web/components.json` y `apps/web/src/styles.css`. La configuración y los componentes compartidos pertenecen a `apps/web`; esta referencia documenta la implementación existente, no una nueva marca ni un rediseño.

Los artefactos generados previamente en `.impeccable/` se conservan sin regenerar. Pueden contener valores del baseline anterior y no sustituyen los estilos actuales ni esta referencia; su actualización mediante la herramienta es una operación separada.
