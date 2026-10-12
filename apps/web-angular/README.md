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
```

The Angular CLI test target uses Vitest. For a single run without watch mode, use `pnpm --filter @amnostt/web-angular exec ng test --watch=false` from the workspace root. End-to-end testing is not configured for this app.

Angular lint is not configured. The existing workspace alias `pnpm lint:web-angular` is therefore not currently usable; root `pnpm lint` checks React and the API only.

## UI components and theme

The app uses Tailwind CSS and Zard UI's Angular components with the Slate theme. `components.json` records the Zard CLI configuration; shared generated utilities and component sources live under `src/app/shared/`. Prefer using those sources when extending the UI, and review generated component changes rather than editing installed framework code. The current shell demonstrates the Zard button.

From `apps/web-angular`, use `pnpm exec ng` for the local Angular CLI. The setup used Zard CLI 1.0.1; to add its button source, use `pnpm dlx zard-cli@1.0.1 add button`. Review generated changes before retaining them, and do not overwrite customized components blindly.

For workspace setup and the React/API checks, see the [workspace README](../../README.md). For implemented system boundaries, see [architecture](../../docs/ARCHITECTURE.md).
