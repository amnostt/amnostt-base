# Angular experimental app

`apps/web-angular` is an independent Angular SPA alongside the React application. It is an experimental UI shell, not an implementation of authentication, sessions, permissions, or tasks.

## Run and verify

From the workspace root:

```bash
pnpm dev:web-angular
```

Open `http://localhost:5174`. Run the app's unit tests and production build with:

```bash
pnpm test:web-angular
pnpm build:web-angular
pnpm lint:web-angular
```

The Angular CLI test target uses Vitest. For a single run without watch mode, use `pnpm --filter @amnostt/web-angular exec ng test --watch=false` from the workspace root. End-to-end testing is not configured for this app.

Angular ESLint checks TypeScript and templates. Prettier owns formatting; `eslint-config-prettier` disables conflicting formatting rules. Naming and type-style exceptions apply only to the copied Zard sources, not application components. Root `pnpm lint` still checks React and the API only.

## UI components and theme

The app uses Tailwind CSS and Zard UI's Angular components with the Slate theme. `components.json` records the Zard CLI configuration; copied components, blocks, and utilities live under `src/app/shared/zard/`. Application-owned presentation lives under `src/app/layout/` and `src/app/pages/`.

The shell adapts the complete visual structure of `sidebar-07`: collapsible sidebar, team switcher, grouped navigation, project menus, account menu, rail, and breadcrumbs. All application UI and accessibility labels are in Spanish. The sidebar primitive has a small local translation of its internal accessibility labels; review this customization before overwriting its source.

`/`, `/403`, and unmatched URLs render Home, Forbidden, and Not Found inside the same shell. The Home link and sidebar controls work; team selection changes local demonstration state only. Users, teams, plans, projects, and navigation sections use clearly marked fixtures. Unimplemented links and account/project actions are disabled; no session, billing, team, or project operation is performed. Decorative placeholder panels remain on Home for visual evaluation. A displayed 403 page is not an authorization guard.

From `apps/web-angular`, use `pnpm exec ng` for the local Angular CLI. The setup used Zard CLI 1.0.1; to add its button source, use `pnpm dlx zard-cli@1.0.1 add button`. Review generated changes before retaining them, and do not overwrite customized components blindly.

For workspace setup and the React/API checks, see the [workspace README](../../README.md). For implemented system boundaries, see [architecture](../../docs/ARCHITECTURE.md).
