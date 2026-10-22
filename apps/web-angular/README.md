# Angular experimental app

`apps/web-angular` is an independent, experimental Angular SPA alongside the React application. It implements login, session restoration, logout, permission-aware navigation, and task listing and creation. Task editing, deletion, and user registration remain pending.

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

`src/app/features/auth/` defines the user/session models, `AuthApi.login/restore/logout`, and the readonly `SessionStore`. Restoration refreshes the cookie-backed session before requesting the current user. Store login handles submission, success, and error states, ignores duplicate submissions, and uses revisions to discard older restoration results. The access token remains private and in memory.

These services are connected to the login component and application startup. `app.config.ts` registers `SessionStore.bootstrap()` through `provideAppInitializer`; Angular waits for restoration to settle before completing initialization. A restored session becomes authenticated, while an unavailable session finishes startup unauthenticated. Concurrent bootstrap consumers share the same pending restoration. The functional `authGuard` protects AppShell activation and child navigation: it waits for unresolved bootstrap, permits authenticated sessions, and otherwise redirects to `/login`. This controls frontend navigation only; the backend remains the authorization authority. Unit tests use a mocked HTTP backend, so they do not prove real browser cookie/session behavior.

The sidebar's logout action calls the cookie-backed `POST /api/auth/logout` endpoint, which responds with no content. `SessionStore.logout()` immediately clears its private token, invalidates older login/restoration results, and publishes `logout-pending`; duplicate logout and new authentication attempts are blocked until it settles. Local cleanup always ends unauthenticated, even when the remote request fails. The store propagates remote errors, but the sidebar intentionally handles them silently and navigates to `/login` with history replacement in either outcome. No warning or remote-success message is shown; a failed request does not prove server revocation or cookie removal. Other account, team and project actions remain demonstrations.

`src/app/features/auth/presentation/login/` contains the Spanish login component adapted from Zard's `login-02`, available publicly at `/login` outside the sidebar shell. It preserves the two-column desktop layout, hides the demonstration cover on smaller screens, and provides labelled credential inputs and local validation. GitHub, registration, and password recovery remain visible but disabled demonstration actions. Submission calls `SessionStore.login()`, derives loading from its state, clears the password after authenticated success, and navigates to `/` with history replacement. A rejected login stays on the form with a safe Spanish error. Component and routing tests exercise these behaviors through the rendered form and a mocked HTTP backend, including duplicate-submission prevention, retry, and entry into the guarded shell. The user accepted the login layout and reported a successful local login-to-sidebar-to-logout flow after starting the database. This manual confirmation is separate from the mocked tests; automated browser cookie and server-revocation checks have not been performed.

The development server forwards `/api/**` through `src/proxy.conf.json` to the local API at `http://localhost:3000`; restart `ng serve` after changing the proxy. This proxy does not configure production deployment. Follow the local tracker `odd/tasks/angular-auth-session.md` from the repository root for the current slice; `odd/` is ignored by Git and mirrored in Engram.

## Tasks

The protected `/tasks` route lists authorized tasks with loading, empty, error and retry states. Search, filters, sorting and pagination are backed by URL query parameters. `TasksApi` uses the shared `AuthenticatedApiClient`; credentials remain owned by `SessionStore`, and obsolete session results are rejected.

Creation is available with `tasks:create:own` or `tasks:create:any`, independently of role names. The backend still authorizes every request and determines ownership. A single reactive form opens in the official Zard Sheet: bottom on mobile, right on desktop. It submits a trimmed title, optional description and calendar date, and the selected status; title and description limits remain 120 and 2,000 characters.

- Closing a changed draft through the corner button, Escape or backdrop opens the official AlertDialog. Continuing editing retains the same form and values; discarding closes without saving or refreshing, and reopening starts empty. Returning all values to their defaults allows a clean close.
- Saving blocks all three close routes and duplicate submissions. Success closes the Sheet and refreshes the current query once. Failure preserves entered values and permits retry; a late result from a replaced session cannot publish success.
- Component, routing and mocked HTTP integration tests exercise these behaviors, including current-query refresh ordering. The user reported successful browser checks on desktop/mobile; this is separate from automated browser or real-service persistence verification. Editing and deletion are not implemented in Angular yet.

## UI components and theme

The app uses Tailwind CSS and Zard UI's Angular components with the Slate theme. `components.json` records the Zard CLI configuration; copied components, blocks, and utilities live under `src/app/shared/zard/`. Application-owned presentation lives under `src/app/layout/`, `src/app/pages/`, and feature-local `presentation/` directories.

The shell adapts the complete visual structure of `sidebar-07`: collapsible sidebar, team switcher, grouped navigation, project menus, account menu, rail, and breadcrumbs. All application UI and accessibility labels are in Spanish. The sidebar primitive has a small local translation of its internal accessibility labels; review this customization before overwriting its source.

For authenticated visitors, `/`, `/403`, and unmatched URLs render Home, Forbidden, and Not Found inside the same protected shell. Anonymous visitors are redirected to `/login` without rendering the shell. The Home link and sidebar controls work; team selection changes local demonstration state only. Users, teams, plans, projects, and navigation sections use clearly marked fixtures. Unimplemented links and account/project actions remain disabled; logout is the sidebar's only connected session action, with a disabled Spanish pending state while its request runs. Decorative placeholder panels remain on Home for visual evaluation. The displayed 403 page does not enforce role or permission checks.

From `apps/web-angular`, use `pnpm exec ng` for the local Angular CLI. The setup used Zard CLI 1.0.1; to add its button source, use `pnpm dlx zard-cli@1.0.1 add button`. Review generated changes before retaining them, and do not overwrite customized components blindly.

For workspace setup and the React/API checks, see the [workspace README](../../README.md). For implemented system boundaries, see [architecture](../../docs/ARCHITECTURE.md).
