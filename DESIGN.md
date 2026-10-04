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

# Design System: Amnostt Base

## Overview

**Creative North Star: "Claridad neutral para operar"**

La interfaz actual utiliza una dirección neutral y funcional: la jerarquía, el estado y la accesibilidad tienen prioridad sobre la ornamentación. La configuración `base-vega` de shadcn/ui, las primitivas compatibles con Base UI y los tokens CSS semánticos forman un sistema que puede sostener autenticación y gestión de tareas sin introducir una identidad visual inventada fuera del código.

El sistema usa superficies claras y oscuras, contraste semántico y componentes reconocibles. La dirección visual documenta lo que existe; una recomendación futura o una crítica de Impeccable no modifica por sí sola el contrato implementado.

**Key Characteristics:**

- Neutral y orientado a operación.
- Tokens semánticos en lugar de colores aislados.
- Estados de carga, error, vacío y permisos visibles.
- Responsive con Sidebar adaptable y navegación local segura.

## Colors

La paleta vigente parte de neutrales OKLCH y un color destructivo semántico. El modo oscuro redefine los mismos roles sin cambiar el lenguaje de componentes.

### Primary

- **Carbón primario** (`oklch(0.205 0 0)`): acciones principales y contenido con énfasis.
- **Destructivo semántico** (`oklch(0.577 0.245 27.325)`): acciones o estados destructivos.

### Neutral

- **Fondo** (`oklch(1 0 0)`): superficie base del modo claro.
- **Texto** (`oklch(0.145 0 0)`): contenido principal.
- **Superficie secundaria** (`oklch(0.97 0 0)`): muted, secondary y accent en modo claro.
- **Texto muted** (`oklch(0.556 0 0)`): contenido secundario.
- **Borde/input** (`oklch(0.922 0 0)`): separación y controles.
- **Ring** (`oklch(0.708 0 0)`): foco visible.

**The Semantic Token Rule.** Los componentes consumen roles semánticos; no introducen colores aislados para resolver una pantalla concreta.

## Typography

**Body Font:** Inter Variable (con `sans-serif`).

**Character:** La tipografía es legible, compacta y consistente entre navegación, formularios y datos. No se documentan tamaños que no estén definidos como tokens de proyecto.

### Hierarchy

- **Body:** Inter Variable; lectura de contenido y estados.
- **Label:** Inter Variable; controles, navegación y metadatos.

## Layout

La aplicación usa un shell autenticado con Sidebar, contenido fluido y un contenedor principal de ancho máximo. La Sidebar funciona como drawer en viewport estrecho y como aside en desktop; su estado expandido/colapsado se persiste mediante cookie. Las rutas de Tasks conservan la consulta en la URL y los formularios de creación/edición viven en un Sheet controlado por ruta.

## Elevation & Depth

El sistema se apoya principalmente en contraste tonal, bordes semánticos y separación espacial. No se establece una escala de sombras global en la implementación documentada; cualquier elevación nueva debe demostrar necesidad y respetar accesibilidad.

## Shapes

La configuración usa un radio base de `0.625rem` y deriva escalas semánticas para componentes. Los controles, diálogos, Sheets y Sidebar conservan la geometría de las primitivas compartidas; no se debe introducir una familia de radios paralela sin evidencia.

## Components

Las primitivas disponibles y comprobadas incluyen `Button`, `Input`, `Label`, `AlertDialog`, `Sheet`, `Toast` y `Sidebar`.

### Buttons

- **Shape:** radio semántico derivado del radio base.
- **Primary:** roles `primary` y `primary-foreground`.
- **Hover / Focus:** conservar estados de foco visibles y los estados definidos por la primitiva.

### Inputs / Fields

- **Style:** superficie de fondo, borde/input semántico y radio compartido.
- **Focus:** usar el ring semántico visible.
- **Error / Disabled:** preservar los estados y mensajes comprobados por los formularios.

### Navigation

- **Style:** Sidebar compartida con navegación primaria, acción de logout y control de colapso.
- **Responsive:** drawer móvil y aside desktop.
- **Access:** la visibilidad de Tasks depende del permiso de lectura, pero el backend mantiene la autoridad.

### Sheets and Dialogs

- **Sheet:** creación y edición de Tasks mediante ruta.
- **AlertDialog:** confirmación de eliminación y advertencia de acción irreversible.

## Do's and Don'ts

### Do:

- **Do** reutilizar las primitivas disponibles antes de crear una nueva.
- **Do** mantener contraste, foco visible, estados de carga/error/vacío y comportamiento responsive.
- **Do** documentar una brecha como brecha hasta que exista código y pruebas que la resuelvan.
- **Do** usar `PRODUCT.md` para verdad de producto y `.impeccable/` para configuración, superficies y críticas.

### Don't:

- **Don't** convertir recomendaciones visuales en contratos implementados automáticamente.
- **Don't** tratar la UI como frontera de autorización.
- **Don't** afirmar que existen `Card`, `Breadcrumb`, `Table`, `Select`, `Textarea`, `Menu`, `Pagination`, `Skeleton` o `EmptyState` compartidos sin evidencia actual.
- **Don't** cambiar el copy visible de la aplicación por el idioma de esta documentación.
