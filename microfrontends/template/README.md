# Microfrontend template

Skeleton for a Lamassu dashboard module. The dashboard shell loads it at runtime
(Module Federation), mounts it inside its own router and layout, and hands it the user's
token, API URLs and permissions through the `@lamassu/mfe-sdk` contract.

> This template currently lives in the dashboard repository and consumes the SDK as a
> workspace package (`workspace:*`). To use it from another repository, the SDK has to be
> published first.

## Create a module

1. Copy this folder next to it: `cp -r microfrontends/template microfrontends/<my-module>`
   (do not copy `node_modules/` or `dist/`).
2. In `package.json` change `name` to `@lamassu/mfe-<my-module>`.
3. In `module.json` set:
   - `name`: Module Federation name. Must match `^[A-Za-z_][A-Za-z0-9_]*$` (use underscores, not dashes) and be unique.
   - `basePath`: route the module is mounted under (e.g. `/my-module`). It must not start with a built-in route such as `/devices`.
   - `nav`: sidebar `group` (an existing one such as `PKI`, or a new one), `label`, optional `icon` (a lucide name known to the shell, falls back to a puzzle icon) and optional `uiAuthzCapabilities` (hide the entry unless the user has `ui` on that capability).
   - `entry`: change the port in `http://localhost:<port>/remoteEntry.js` to your `DEV_PORT`.
4. In `vite.config.ts` set `DEV_PORT` to a free port (each module needs its own).
5. Replace the template's own names in the copy: search the folder for `mfe-template`, `mfe_template`, `microfrontends/template` and `Template module` (test fixtures, the example page heading, the Dockerfile default arguments such as `ARG MODULE_PATH=template`). Run the tests afterwards.
6. Run `pnpm install` at the repository root.
7. Develop:
   - `pnpm --filter @lamassu/mfe-<my-module> dev:standalone` runs the module alone, with a mock shell (it opens `/standalone.html`). Set `VITE_API_URL` and `VITE_ACCESS_TOKEN` in a `.env.local` to talk to a backend.
   - `pnpm --filter @lamassu/mfe-<my-module> dev` serves it as a remote so the dashboard can load it.
8. Try it in the dashboard: add the contents of your `module.json` to the `modules` array of the dashboard's `public/modules.json` (restart is not needed, reload the page). Remove the entry and the module disappears; the dashboard is never rebuilt.

## What you write

- `src/module.tsx`: the only thing the shell loads. Default-exports `{ contractVersion, Root }`. `Root` receives `shell` and renders your relative `<Routes>`. Do not create a `BrowserRouter`.
- `src/routes/`: your pages. Link between them with `` `${shell.basePath}/…` `` (`Link` from `react-router`). Use `useShell()` for the token (`getAccessToken()`), API URLs, `hasCapability(key, action?)`, `theme` and `notify`.
- `src/lib/api.ts`: example authenticated `fetch` helper.
- Styling: Tailwind utilities resolve to the dashboard's CSS variables, so light/dark mode and the theme come for free. **Every utility must carry the `mfe:` prefix** (`mfe:p-4`, `mfe:md:grid-cols-2`, `mfe:bg-card`): the module's CSS and the dashboard's end up in the same document and an unprefixed class (e.g. `p-4`) would override the dashboard's own utilities on every page. Only the `theme` and `utilities` layers are included (no preflight). Components from the dashboard's `components/ui` are not shared: copy the ones you need into your module.

## Rules that keep modules compatible

- `modules.json` is code-equivalent configuration: the dashboard downloads and runs each `entry` inside its own origin (which holds the user's tokens). Protect that file like the dashboard image, prefer same-origin entries (`/ui/modules/<name>/remoteEntry.js`) with a `script-src 'self'` CSP, and use cross-origin entries (`http://localhost:<port>/…`) only for development. Entries that are not `http(s)` URLs or paths are ignored.

- Share only `react`, `react-dom` and `react-router` (already configured, same ranges as the shell). Their major versions are part of the contract: when the shell changes one, the SDK major changes and modules must be rebuilt.
- Never read the token once and keep it: call `shell.getAccessToken()` for every request (tokens are renewed silently).
- If your module fails to load or crashes, the shell shows an error panel with Retry inside the content area; the rest of the dashboard keeps working.

## Build and deploy

- `pnpm --filter @lamassu/mfe-<my-module> build` produces `dist/` (`remoteEntry.js` + hashed `assets/`). The build uses a relative base, so it works from any path.
- `Dockerfile` + `nginx.conf` serve it under `/ui/modules/<name>/` (`remoteEntry.js` is `no-cache`, `assets/` are `immutable`). Build from the repository root:

  ```bash
  docker build -f microfrontends/<my-module>/Dockerfile \
    --build-arg MODULE_DIR=microfrontends/<my-module> --build-arg MODULE_PATH=<my-module> \
    -t <registry>/<my-module>:<tag> .
  ```

- In production the manifest `entry` is relative to the dashboard origin: `/ui/modules/<my-module>/remoteEntry.js`.

## Tests

`pnpm --filter @lamassu/mfe-<my-module> test` (also run by `pnpm test` at the repository root).
