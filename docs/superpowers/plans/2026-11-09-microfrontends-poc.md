# Microfrontends PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the dashboard into a Module Federation host that loads microfrontends declared in a runtime `/modules.json`, plus a copyable template and a working "PoC Service" instance.

**Architecture:** The repo root stays the shell. A pnpm workspace adds `packages/mfe-sdk` (public contract: manifest types, `ShellApi`, `ShellProvider`, theme CSS) and `microfrontends/{template,poc-service}`. The shell fetches `/modules.json`, registers each entry with the Module Federation runtime, adds a `basePath/*` route and a sidebar entry per module, and renders the remote's `Root` inside the existing `BrowserRouter`, behind an error boundary.

**Tech Stack:** React 19, react-router 7, Vite 8, `@module-federation/vite` (1.23.x, peer-supports Vite 8), Tailwind v4, zod, vitest + happy-dom, pnpm 12 workspaces.

**Spec:** `docs/superpowers/specs/2026-11-09-microfrontends-poc-design.md`

## Global Constraints

- Use Node via fnm (`eval "$(fnm env)" && fnm use 24`); the system Node breaks tests.
- Work on a new branch `feat/microfrontends-poc` (currently on `v4`). Never `git add -A`/`git add .`: the tree has unrelated local changes (`.gitignore`, `.vscode/settings.json`, `public/config.js`, `public/python/`, `public/wiregasm/`, `.codegraph/`). Stage explicit paths only.
- Commit messages carry **no** attribution lines (user rule: no Co-Authored-By / Generated-with).
- Every file ends with a newline. Use the `@/*` alias inside the shell.
- Before the final commit of every task that touches shell code: `pnpm run typecheck` and `pnpm run lint` must pass.
- Shell open source bundle must contain no module-specific names/paths: `grep -rl "poc_service\|poc-service" out/` prints nothing after `pnpm run build`.
- Manifest: `/modules.json`, `{ "version": 1, "modules": [...] }`; entry `{ name, entry, basePath, nav: { group, label, icon?, uiAuthzCapabilities? } }`. No/404/empty file → shell runs with no external modules. Invalid entries are dropped with `console.warn`; they never break the others.
- Contract: remote exposes only `./module` (default export `ModuleDefinition`); `SDK_CONTRACT_VERSION` is an integer equal to the SDK package major (`1`); shell refuses a mismatching `contractVersion` with a visible error in the module's page.
- Shared singletons (shell and template): `react`, `react-dom`, `react-router`, with `requiredVersion` bounded to the major (`^19`, `^7`).
- `hasCapability(key, action = 'ui')`: true if `capabilities[key]` includes `action`; `capabilities === null` (auth disabled) → `true`.
- A remote failing to load or render must show an error inside the content area (module name + Retry) and leave sidebar/header and other pages working.
- SDK lives only in this repo (`workspace:*`, TS source consumed directly, no build step); its `package.json` still has `name`, `version`, and an `exports` map including `./theme.css`.
- Remote styles: Tailwind v4 importing the SDK `theme.css`, only `theme` + `utilities` layers (no preflight).
- Template serves under `/ui/modules/<name>/`: `remoteEntry.js` `no-cache`, hashed assets `immutable`.

## Review Focus

Failure modes the spec implies but no task's happy path exercises (each has a test in the named task):

1. `/modules.json` answered with `index.html` (SPA fallback, HTTP 200), 404, invalid JSON, or a network error → shell boots with zero modules (Task 3).
2. Manifest entries with duplicate `name`/`basePath`, or a `basePath` whose first segment is a native route (e.g. `/devices`) → later/colliding entries dropped, native pages keep working (Task 2 duplicates, Task 3 collisions).
3. A module's `remoteEntry.js` unreachable, or its `Root` throwing during render → error panel with Retry, shell intact, panel clears after navigating elsewhere (Task 5).
4. Access token renewed after the module mounted → `getAccessToken()` returns the current token, not the one at mount (Task 5).
5. Auth disabled (`capabilities === null`) → menu items and `hasCapability` stay visible/true (Task 4).

---

### Task 1: Federation spike and host plugin

Confirms `@module-federation/vite` works with this repo's Vite 8 + React 19 + react-router 7 before anything else is built. Answers are recorded; later tasks use them.

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (add `@module-federation/vite`, `@module-federation/runtime`), `vite.config.mjs`
- Create: `docs/superpowers/notes/2026-11-09-mfe-spike.md`
- Throwaway (delete before commit): `microfrontends/_spike/`

**Interfaces:**
- Produces: the notes file answers (these names are consumed by Tasks 3 and 6): (a) the exact module specifier that exports `registerRemotes`/`loadRemote`; (b) the plugin options the **host** needs in `vite.config.mjs` (e.g. `build.target`) and the **remote** needs (`base`, `filename`, `exposes`, `shared` incl. whether `react/` and `react/jsx-runtime` entries are needed, dev-server CORS); (c) which `base` makes a remote's assets resolve relative to wherever `remoteEntry.js` is served from.

- [ ] **Step 1: Create branch and install**
Run `git switch -c feat/microfrontends-poc`, then `pnpm add @module-federation/vite @module-federation/runtime`.

- [ ] **Step 2: Wire the host plugin**
In `vite.config.mjs` add `federation({ name: 'lamassu_shell', remotes: {}, shared: { react: { singleton: true, requiredVersion: '^19' }, 'react-dom': { singleton: true, requiredVersion: '^19' }, 'react-router': { singleton: true, requiredVersion: '^7' } } })` to `plugins`, adding whatever build option the plugin needs for top-level await.

- [ ] **Step 3: Build a throwaway remote in `microfrontends/_spike/`**
Vite + React remote exposing `./module` whose default export `{ contractVersion: 1, Root }` renders a component that calls `useLocation()` from `react-router` and uses one Tailwind utility class. Shell side: a temporary `console` snippet in `src/main.tsx` that calls `registerRemotes` then `loadRemote('spike/module')`.

- [ ] **Step 4: Verify in dev and in a production build**
Run the remote (`vite build && vite preview` and dev) and the shell (`pnpm dev`, then `pnpm build && pnpm start`). Expected, for both modes: `loadRemote` resolves the module; the remote's `useLocation()` returns the shell's current path (proves router singleton); the remote's CSS is applied; changing the remote's `base` does not break asset loading when served from a sub-path (e.g. `/ui/modules/spike/`).

- [ ] **Step 5: Record findings, remove the spike, check the shell**
Write the three answers above in the notes file. If the plugin cannot work with this stack, stop here and write the alternative (pinned plugin version or runtime-only) in the notes and ask the user. Delete `microfrontends/_spike/` and the temporary snippet; run `pnpm run typecheck && pnpm run build`. Expected: both pass; `out/` still runs the existing app.

- [ ] **Step 6: Commit**
`git add package.json pnpm-lock.yaml vite.config.mjs docs/superpowers/specs docs/superpowers/plans docs/superpowers/notes && git commit -m "feat(mfe): add module federation host plugin and spike notes"`

---

### Task 2: Workspace and SDK contract package

**Files:**
- Modify: `pnpm-workspace.yaml` (add `packages: ['.', 'packages/*', 'microfrontends/*']`), `tsconfig.json` (add `microfrontends` to `exclude`; each remote gets its own tsconfig), `package.json` (lint script also covers `'packages/*/src/**/*.{ts,tsx}'` and `'microfrontends/*/src/**/*.{ts,tsx}'`), `Dockerfile`
- Create: `packages/mfe-sdk/package.json`, `packages/mfe-sdk/src/{index.ts,manifest.ts,shell-api.ts,shell-context.tsx}`
- Test: `packages/mfe-sdk/src/manifest.test.ts`, `packages/mfe-sdk/src/shell-context.test.tsx`

**Interfaces:**
- Produces (all exported from `@lamassu/mfe-sdk` via `src/index.ts`):
  - `SDK_CONTRACT_VERSION = 1`
  - `interface ModuleNav { group: string; label: string; icon?: string; uiAuthzCapabilities?: string }`
  - `interface ModuleDescriptor { name: string; entry: string; basePath: string; nav: ModuleNav }`
  - `parseManifest(raw: unknown, onInvalid?: (message: string) => void): ModuleDescriptor[]`
  - `interface ShellApi { getAccessToken(): string | null; apiBaseUrl: string; publicApiUrl: string; hasCapability(key: string, action?: string): boolean; basePath: string; theme: 'light' | 'dark'; notify: { success(title: string, description?: string): void; error(title: string, description?: string): void } }`
  - `interface ModuleDefinition { contractVersion: number; Root: React.ComponentType<{ shell: ShellApi }> }`
  - `ShellProvider({ value: ShellApi; children })`, `useShell(): ShellApi` (throws `'useShell must be used within a ShellProvider'` outside a provider)

- [ ] **Step 1: Write failing tests for `parseManifest`** in `manifest.test.ts`:
  - valid manifest returns the descriptors unchanged;
  - `version: 2`, non-object, or `modules` not an array → `[]`;
  - entry with invalid `name` (`'poc-service'`, `'1abc'`), `basePath` not starting with `/` or equal to `/`, empty `entry`, empty `nav.label`/`nav.group` → dropped, `onInvalid` called once per dropped entry, valid siblings kept;
  - `basePath: '/poc/'` is normalized to `'/poc'`;
  - second entry with duplicate `name` or duplicate `basePath` is dropped and reported.
  Valid `name` regex: `^[A-Za-z_][A-Za-z0-9_]*$`.

- [ ] **Step 2: Run `pnpm exec vitest run packages/mfe-sdk` — expect FAIL** (module not found).

- [ ] **Step 3: Create the package and implement `manifest.ts`** with a zod schema (zod is already a dependency of the root; declare it in the SDK `package.json` as a dependency, `react` as a peerDependency). `package.json`: `name: "@lamassu/mfe-sdk"`, `version: "1.0.0"`, `private: true`, `exports: { ".": "./src/index.ts", "./theme.css": "./src/theme.css", "./tokens.css": "./src/tokens.css" }` (the two CSS files are created in Task 6).

- [ ] **Step 4: Write failing test for `useShell`** in `shell-context.test.tsx`: inside `ShellProvider` with a fake `ShellApi` returns the same object (`toBe`); outside it throws the message above.

- [ ] **Step 5: Implement `shell-api.ts` and `shell-context.tsx`**, export all from `index.ts`.

- [ ] **Step 6: Make the workspace install and the shell Docker build keep working**
Add `"@lamassu/mfe-sdk": "workspace:*"` to the root `dependencies`; run `pnpm install`. In `Dockerfile`, the install step runs before `COPY . .` with a frozen lockfile, so the workspace `package.json` files must exist: add `COPY packages packages` and `COPY microfrontends microfrontends` before `pnpm install` (simplest; check `.dockerignore` does not exclude them). Verify with `docker build -t lamassu-dashboard:mfe .` if Docker is available; otherwise say it was not verified.

- [ ] **Step 7: Run `pnpm exec vitest run packages/mfe-sdk && pnpm run typecheck && pnpm run lint` — expect PASS.**

- [ ] **Step 8: Commit** with explicit paths (`pnpm-workspace.yaml tsconfig.json package.json pnpm-lock.yaml Dockerfile packages/`), message `feat(mfe): add workspace and @lamassu/mfe-sdk contract package`.

---

### Task 3: Shell manifest loading and remote registration

**Files:**
- Create: `src/lib/modules/manifest-loader.ts`, `src/lib/modules/federation.ts`, `src/contexts/ModulesContext.tsx`, `public/modules.json` (content `{ "version": 1, "modules": [] }`)
- Modify: `nginx.conf`, `src/main.tsx`
- Test: `src/lib/modules/manifest-loader.test.ts`, `src/lib/modules/federation.test.ts`

**Interfaces:**
- Consumes: `parseManifest`, `ModuleDescriptor`, `ModuleDefinition` from `@lamassu/mfe-sdk`; the runtime specifier from the Task 1 notes (written `FED_RUNTIME` below).
- Produces:
  - `loadModulesManifest(reservedFirstSegments: string[], fetchImpl?: typeof fetch): Promise<ModuleDescriptor[]>`
  - `registerModuleRemotes(modules: ModuleDescriptor[]): void`
  - `loadModuleDefinition(name: string): Promise<ModuleDefinition>`
  - `ModulesProvider({ reservedFirstSegments: string[]; children })`, `useModules(): { status: 'loading' | 'ready'; modules: ModuleDescriptor[] }`

- [ ] **Step 1: Write failing loader tests** (inject a fake `fetchImpl`; spy `console.warn`):
  - valid body → descriptors; the request is `fetch('/modules.json', { cache: 'no-store' })`;
  - HTTP 404 → `[]`; HTTP 200 with `text/html` body (`<!doctype html>…`) → `[]` + one warn; body `{not json` → `[]`; `fetchImpl` rejects → `[]`; none of these throw;
  - `reservedFirstSegments = ['devices']` drops a module with `basePath: '/devices/x'` and keeps `/poc-service`.

- [ ] **Step 2: Run them — expect FAIL.** Then implement `manifest-loader.ts` (warn via `console.warn`; reuse `parseManifest`'s `onInvalid`).

- [ ] **Step 3: Write failing federation tests** with `vi.mock(FED_RUNTIME)`:
  - `registerModuleRemotes([{ name: 'poc_service', entry: '/ui/modules/poc-service/remoteEntry.js', ... }])` calls `registerRemotes` with `[{ name: 'poc_service', entry: '<origin>/ui/modules/poc-service/remoteEntry.js', type: 'module' }]` (relative entries resolved against `window.location.origin`; absolute ones untouched); an empty list does not call it;
  - `loadModuleDefinition('poc_service')` calls `loadRemote('poc_service/module')` and returns the module's `default`;
  - `loadRemote` resolving `null`, or a module without `default`, rejects with an Error mentioning the module name.

- [ ] **Step 4: Run — expect FAIL; implement `federation.ts`.**

- [ ] **Step 5: Implement `ModulesContext.tsx`** (loads once on mount, calls `registerModuleRemotes`, then `status: 'ready'`). In `main.tsx`, wrap `<BrowserRouter>` in `<ModulesProvider reservedFirstSegments={...}>` where the segments come from the first path segment of every entry in `pages`. Test with a `renderHook` that `status` is `'loading'` first and `'ready'` after the fetch resolves, in `src/contexts/ModulesContext.test.tsx`.

- [ ] **Step 6: Nginx.** Add `location = /modules.json { add_header Cache-Control "no-store"; try_files $uri =404; }` before `location /` so a missing file is a real 404, not `index.html`.

- [ ] **Step 7: Run `pnpm exec vitest run src/lib/modules src/contexts/ModulesContext.test.tsx && pnpm run typecheck && pnpm run lint` — expect PASS. Commit** (`feat(mfe): load modules manifest and register remotes`).

---

### Task 4: Navigation merge and capabilities in the shell

**Files:**
- Create: `src/lib/navigation.ts`, `src/lib/module-icons.ts`, `src/contexts/CapabilitiesContext.tsx`
- Modify: `src/app/layout.tsx` (move `NavItem`/`NavGroup` out; `navigationConfig` stays there)
- Test: `src/lib/navigation.test.ts`, `src/contexts/CapabilitiesContext.test.tsx`

**Interfaces:**
- Consumes: `useModules()` (Task 3).
- Produces:
  - `export interface NavItem`, `NavGroup` (moved verbatim from `layout.tsx`) and `mergeNavigation(base: NavGroup[], modules: ModuleDescriptor[]): NavGroup[]` in `navigation.ts`
  - `resolveModuleIcon(name?: string): React.ElementType` in `module-icons.ts`
  - `hasCapability(capabilities: Record<string, string[]> | null, key: string, action?: string): boolean`, `CapabilitiesProvider({ value, children })`, `useCapabilities(): Record<string, string[]> | null` in `CapabilitiesContext.tsx`

- [ ] **Step 1: Write failing tests.**
  - `hasCapability`: `null` → true; `{ 'pki.ca.ca_certificate': ['ui'] }` + that key → true; key present without `'ui'` → false; missing key → false; `hasCapability(caps, key, 'create')` checks `create`.
  - `mergeNavigation`: a module with `nav.group: 'PKI'` is appended to the existing `PKI` group (label match exact); `nav.group: 'ENTERPRISE'` creates a group after all native ones, and two modules in `ENTERPRISE` share it, in manifest order; item `href` equals `basePath` and `uiAuthzCapabilities` is copied; a module whose `basePath` equals an existing item `href` is skipped; `base` is not mutated (`toEqual` a deep clone taken before).
  - `resolveModuleIcon`: `'flask-conical'` and an unknown name both return a component (unknown → the fallback `Puzzle`, `not.toBeUndefined()`); `undefined` → fallback.

- [ ] **Step 2: Run — expect FAIL. Implement the three files.** `module-icons.ts` is a curated map of ~12 kebab-case lucide icon names (must include `flask-conical`), not the full icon set, to keep the shell bundle small.

- [ ] **Step 3: Wire `layout.tsx`.**
  - Import `NavItem`/`NavGroup` from `@/lib/navigation`.
  - In `MainLayoutContent`: `const { modules } = useModules(); const navGroups = useMemo(() => mergeNavigation(navigationConfig, modules), [modules]);` and use `navGroups` in both the redirect effect and the sidebar `map`.
  - Rewrite `isNavItemVisible` as `!item.uiAuthzCapabilities || hasCapability(globalCapabilities, item.uiAuthzCapabilities)` (same behavior as today, now shared).
  - In `InnerLayout`, wrap both `MainLayoutContent` returns in `<CapabilitiesProvider value={globalCapabilities}>`.

- [ ] **Step 4: Run `pnpm exec vitest run src/lib/navigation.test.ts src/contexts/CapabilitiesContext.test.tsx && pnpm run typecheck && pnpm run lint && pnpm test` (whole suite, to prove existing behavior is intact) — expect PASS. Commit** (`feat(mfe): merge module entries into the sidebar and share capabilities`).

---

### Task 5: Remote module host, error handling and routes

**Files:**
- Create: `src/hooks/useShellApi.ts`, `src/components/modules/ModuleErrorBoundary.tsx`, `src/components/modules/RemoteModuleHost.tsx`, `src/components/modules/module-routes.tsx`
- Modify: `src/main.tsx` (`AppRoutes`)
- Test: `src/hooks/useShellApi.test.tsx`, `src/components/modules/RemoteModuleHost.test.tsx`

**Interfaces:**
- Consumes: `loadModuleDefinition` (Task 3), `useCapabilities`/`hasCapability` (Task 4), `getStoredAccessToken` (`@/lib/auth-session`), `getPublicAPIUrl` (`@/lib/api-domains`), `useConfig`, `useTheme`, the `sileo` wrapper used in `OcspCheckModal.tsx`.
- Produces:
  - `useShellApi(basePath: string): ShellApi` — `apiBaseUrl` from `config.LAMASSU_API ?? ''`, `publicApiUrl` from `getPublicAPIUrl()`, `theme` from `isDarkMode`, `getAccessToken` reads `getStoredAccessToken()` **at call time**, memoized so identity changes only when capabilities, theme, base URL or `basePath` change
  - `ModuleErrorBoundary({ moduleName: string; resetKey: string; onRetry: () => void; children })`
  - `RemoteModuleHost({ module }: { module: ModuleDescriptor })`
  - `renderModuleRoutes(modules: ModuleDescriptor[]): React.ReactElement[]` → one `<Route path={`${basePath}/*`} element={<RemoteModuleHost module={m} />} />` each

- [ ] **Step 1: Write failing `useShellApi` tests** (mock `useConfig`/`useTheme`; real `CapabilitiesProvider`):
  - `getAccessToken()` returns `'test-access-token'` (set by `src/lib/test-utils/setup.ts`), then after overwriting the `oidc.user:https://auth.test.lamassu.io:test-client-id` localStorage entry with `{ access_token: 'renewed' }` the **same** `shell` object returns `'renewed'`;
  - `hasCapability('k')` true/false per the contract; with `CapabilitiesProvider value={null}` → true;
  - `theme` is `'dark'` when `isDarkMode`; `basePath` is echoed.

- [ ] **Step 2: Write failing `RemoteModuleHost` tests** (`vi.mock('@/lib/modules/federation')`, `MemoryRouter`; a fake `Root` rendering `shell.basePath`):
  - success → renders the module's `Root` with `shell.basePath === '/poc-service'`;
  - `loadModuleDefinition` rejects → text containing the module name and `Retry`; clicking Retry calls it a second time and, if it now resolves, shows the module;
  - `contractVersion: 99` → an "incompatible" message (naming the expected and received versions), `Root` never rendered;
  - `Root` throws on render → error panel shown while a sibling `<nav>` rendered outside the host remains in the document; navigating (changing the `MemoryRouter` location) clears the panel.

- [ ] **Step 3: Run — expect FAIL. Implement** `useShellApi.ts`, `ModuleErrorBoundary.tsx` (class component, resets on `resetKey` change; panel built with existing `ui/` components, in the content area, not full-page), `RemoteModuleHost.tsx` (state machine `loading | ready | error`; checks `definition.contractVersion === SDK_CONTRACT_VERSION`; uses `Suspense`-free loading spinner like `PageLoader`; `resetKey` = `useLocation().pathname`), `module-routes.tsx`.

- [ ] **Step 4: Wire `AppRoutes` in `main.tsx`.** Call `useModules()`; while `status === 'loading'` return `<PageLoader />` (so a deep link or refresh on `/poc-service/...` never flashes "Page not found"); otherwise insert `{renderModuleRoutes(modules)}` before the `path="*"` route.

- [ ] **Step 5: Run `pnpm exec vitest run src/hooks/useShellApi.test.tsx src/components/modules && pnpm run typecheck && pnpm run lint && pnpm test` — expect PASS. Commit** (`feat(mfe): render remote modules behind an error boundary`).

---

### Task 6: Microfrontend template

**Files:**
- Create under `microfrontends/template/`: `package.json` (name `@lamassu/mfe-template`; scripts `dev`, `dev:standalone`, `build`, `typecheck`, `test`), `vite.config.ts`, `tsconfig.json`, `index.html` (standalone only), `module.json`, `README.md`, `Dockerfile`, `nginx.conf`, `src/module.tsx`, `src/routes/HomePage.tsx`, `src/lib/api.ts`, `src/styles.css`, `src/standalone/main.tsx`, `src/standalone/mock-shell.ts`
- Create: `packages/mfe-sdk/src/theme.css` (the `@custom-variant dark` line and the `@theme { … }` token mapping block copied from `src/app/globals.css:5-80`), `packages/mfe-sdk/src/tokens.css` (the `--*` variables of `:root` and `.dark` from `globals.css`, with a `// TODO: refactor - duplicated in src/app/globals.css` comment; only used by standalone mode)
- Test: `microfrontends/template/src/routes/HomePage.test.tsx`

**Interfaces:**
- Consumes: SDK exports from Task 2; Task 1 notes for `vite.config.ts` options.
- Produces: the contract a copy must satisfy — `src/module.tsx` default-exports `{ contractVersion: SDK_CONTRACT_VERSION, Root }` where `Root({ shell })` wraps `<Routes>` in `<ShellProvider value={shell}>`; `module.json` is the manifest fragment `{ name, entry, basePath, nav }` (entry shows the dev URL `http://localhost:<DEV_PORT>/remoteEntry.js`; README says to change it to `/ui/modules/<name>/remoteEntry.js` in production); `src/lib/api.ts` exports `apiGet<T>(shell: ShellApi, path: string): Promise<T>` which fetches `${shell.apiBaseUrl}${path}` with `Authorization: Bearer <shell.getAccessToken()>` and throws on non-2xx.

- [ ] **Step 1: Write failing `HomePage.test.tsx`:** with `vi.spyOn(globalThis, 'fetch')` returning a stats JSON and a fake `ShellApi` whose `getAccessToken` returns `'tok'`: the page calls fetch once with an `Authorization: Bearer tok` header, shows a value from the response, and shows an error message when fetch returns 500. (Page: calls `apiGet(shell, '/ca/v1/stats')`, built on `apiBaseUrl`.)

- [ ] **Step 2: Run `pnpm install && pnpm exec vitest run microfrontends/template` — expect FAIL. Implement** `src/lib/api.ts`, `HomePage.tsx`, `module.tsx`.

- [ ] **Step 3: Config files.**
  - `vite.config.ts`: reads `name` from `module.json`; `DEV_PORT` constant at the top; federation `exposes: { './module': './src/module.tsx' }`, `filename: 'remoteEntry.js'`, `shared` exactly as in Global Constraints; the `base` and dev-CORS options from the Task 1 notes; `@tailwindcss/vite`.
  - `src/styles.css`: imports SDK `theme.css` plus `tailwindcss/theme` and `tailwindcss/utilities` only (no preflight); imported from `module.tsx`.
  - `src/standalone/main.tsx` + `mock-shell.ts`: dev-only entry with its own `BrowserRouter`, `tokens.css`, and a `ShellApi` built from `VITE_API_URL`/`VITE_ACCESS_TOKEN`; reachable through `pnpm dev:standalone`, not exposed by the federation config.
  - `Dockerfile` (build with Vite, serve with nginx on a rootless port) and `nginx.conf` (`remoteEntry.js` `Cache-Control: no-cache`; `/assets/` `immutable`; serves under `/ui/modules/<name>/`).

- [ ] **Step 4: README.** "Create a module" in numbered steps, each a concrete edit: copy the folder; edit `name` in `package.json` and `module.json` (`name` must match `^[A-Za-z_][A-Za-z0-9_]*$`, plus `basePath`, `nav`); set `DEV_PORT`; `pnpm install`; develop standalone or against the shell; add the `module.json` fragment to the shell's `modules.json`. Note that using the template outside this repo requires publishing the SDK first.

- [ ] **Step 5: Verify.** `pnpm --filter @lamassu/mfe-template build` produces `dist/remoteEntry.js`; `pnpm --filter @lamassu/mfe-template typecheck`; `pnpm exec vitest run microfrontends/template` PASS; `pnpm run typecheck && pnpm run lint` still PASS.

- [ ] **Step 6: Commit** (`feat(mfe): add microfrontend template and SDK theme css`).

---

### Task 7: PoC Service and end-to-end verification

**Files:**
- Create: `microfrontends/poc-service/` (copy of the template, following only its README), plus `src/routes/DetailPage.tsx` and a route for it
- Test: `microfrontends/poc-service/src/routes/*.test.tsx` (inherited from the template, plus one for the second page)

**Interfaces:**
- Consumes: everything above. `module.json`: `name: "poc_service"`, `basePath: "/poc-service"`, `nav: { group: "ENTERPRISE", label: "PoC Service", icon: "flask-conical" }`, `entry: "http://localhost:9010/remoteEntry.js"`; `DEV_PORT = 9010`.

- [ ] **Step 1: Create the module strictly from the template README.** Any step that was unclear or missing → fix the README in this task and mention it in the commit body.

- [ ] **Step 2: Two pages.** `/poc-service` (home, authenticated call to `/ca/v1/stats` as in the template) and `/poc-service/detail`, linked from home with `Link` from `react-router` to prove subroutes use the shell's router. Test: each page renders; the home page's link points to `/poc-service/detail`.

- [ ] **Step 3: Run `pnpm install && pnpm --filter ./microfrontends/poc-service build && pnpm exec vitest run microfrontends/poc-service` — expect PASS.**

- [ ] **Step 4: Manual verification matrix** (shell `pnpm dev` on :9002, PoC `pnpm --filter ./microfrontends/poc-service dev` on :9010; to avoid OIDC locally set `LAMASSU_AUTH_ENABLED: false` in the local, uncommitted `public/config.js`). Put the PoC fragment in a **local, uncommitted** `public/modules.json`, then expect:
  1. Entry present → "PoC Service" appears under ENTERPRISE; clicking it renders the page inside the shell layout; navigating to `/poc-service/detail` and back works without reload; styling matches native pages.
  2. Dark/light toggle restyles the module.
  3. Hard refresh on `/poc-service/detail` opens the page (no "Page not found" flash).
  4. Entry removed (`{ "version": 1, "modules": [] }`) → menu entry gone and `/poc-service` shows "Page not found"; no shell rebuild in between.
  5. PoC dev server stopped, entry present → clicking it shows the error panel with Retry; sidebar and other pages work; restarting the PoC and clicking Retry loads it.
  6. `modules.json` deleted → shell boots normally (404 handled).
  If no browser is available, run what can be done with `curl` (`remoteEntry.js` 200, CORS header present) and state explicitly which items were not verified in a browser.

- [ ] **Step 5: Final gates.** `pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build`; then `grep -rl "poc_service\|poc-service" out/` must print nothing; restore `public/modules.json` to the committed empty manifest and `public/config.js` to the user's version before committing.

- [ ] **Step 6: Commit** (`feat(mfe): add PoC Service microfrontend`). Then report the verification matrix results (pass/fail/not verified) to the user.
