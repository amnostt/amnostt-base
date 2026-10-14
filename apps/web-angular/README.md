# Angular experimental app

`apps/web-angular` is an independent Angular SPA alongside the React application. It contains an experimental UI shell and an in-progress authentication/session foundation, not complete authentication, permission, or task flows.

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

## Authentication foundation

`src/app/features/auth/` defines the user/session models, `AuthApi.login/restore`, and the readonly `SessionStore`. Restoration refreshes the cookie-backed session before requesting the current user. Store login handles submission, success, and error states, ignores duplicate submissions, and uses revisions to discard older restoration results. The access token remains private and in memory.

These services are connected to the login component and application startup. `app.config.ts` registers `SessionStore.bootstrap()` through `provideAppInitializer`; Angular waits for restoration to settle before completing initialization. A restored session becomes authenticated, while an unavailable session finishes startup unauthenticated. Concurrent bootstrap consumers share the same pending restoration. Route guards and logout are still pending; the sidebar uses demonstration data and actions. Unit tests use a mocked HTTP backend, so they do not prove real browser cookie/session behavior.

`src/app/features/auth/presentation/login/` contains the Spanish login component adapted from Zard's `login-02`, available at `/login` outside the sidebar shell. It preserves the two-column desktop layout, hides the demonstration cover on smaller screens, and provides labelled credential inputs and local validation. GitHub, registration, and password recovery remain visible but disabled demonstration actions. Submission calls `SessionStore.login()`, derives loading from its state, clears the password after authenticated success, and presents a safe Spanish error on failure. Component tests exercise these behaviors through the rendered form and a mocked HTTP backend, including duplicate-submission prevention and retry. The user accepted the visual layout; live authentication checks remain pending. Exposing this route does not protect other pages, and startup restoration does not redirect users between pages.

The development server forwards `/api/**` through `src/proxy.conf.json` to the local API at `http://localhost:3000`; restart `ng serve` after changing the proxy. This proxy does not configure production deployment. Follow the local tracker `odd/tasks/angular-auth-session.md` from the repository root for the current slice; `odd/` is ignored by Git and mirrored in Engram.

## UI components and theme

The app uses Tailwind CSS and Zard UI's Angular components with the Slate theme. `components.json` records the Zard CLI configuration; copied components, blocks, and utilities live under `src/app/shared/zard/`. Application-owned presentation lives under `src/app/layout/`, `src/app/pages/`, and feature-local `presentation/` directories.

The shell adapts the complete visual structure of `sidebar-07`: collapsible sidebar, team switcher, grouped navigation, project menus, account menu, rail, and breadcrumbs. All application UI and accessibility labels are in Spanish. The sidebar primitive has a small local translation of its internal accessibility labels; review this customization before overwriting its source.

`/`, `/403`, and unmatched URLs render Home, Forbidden, and Not Found inside the same shell. The Home link and sidebar controls work; team selection changes local demonstration state only. Users, teams, plans, projects, and navigation sections use clearly marked fixtures. Unimplemented links and account/project actions are disabled; no session, billing, team, or project operation is performed. Decorative placeholder panels remain on Home for visual evaluation. A displayed 403 page is not an authorization guard.

From `apps/web-angular`, use `pnpm exec ng` for the local Angular CLI. The setup used Zard CLI 1.0.1; to add its button source, use `pnpm dlx zard-cli@1.0.1 add button`. Review generated changes before retaining them, and do not overwrite customized components blindly.

For workspace setup and the React/API checks, see the [workspace README](../../README.md). For implemented system boundaries, see [architecture](../../docs/ARCHITECTURE.md).
