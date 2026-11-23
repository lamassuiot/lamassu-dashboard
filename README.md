# LamassuIoT

LamassuIoT is a modern infrastructure for managing X.509 certificates and Public Key Infrastructure (PKI). It provides a user-friendly interface for issuing, inspecting, and verifying certificates, ensuring the security and integrity of your IoT ecosystem.

## Core Features

-   **CA Management**: Create, import, and manage the lifecycle of Certificate Authorities.
-   **RA Management**: Configure Registration Authorities supporting the EST protocol for device enrollment.
-   **Certificate Management**: Issue, inspect, and revoke end-entity certificates.
-   **VA via OCSP and CRL**: Provide certificate validation services through OCSP and Certificate Revocation Lists.
-   **Device Identity Management**: Manage the lifecycle of IoT device identities and their associated certificates.

## Tech Stack

This project is built with a modern, performant, and type-safe technology stack:

-   **Build tool**: [Vite](https://vite.dev/)
-   **Routing**: [React Router](https://reactrouter.com/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **UI Library**: [React](https://react.dev/)
-   **Component Library**: [ShadCN UI](https://ui.shadcn.com/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Authentication**: [OIDC Client](https://github.com/authts/oidc-client-ts) for OpenID Connect integration.
-   **Cryptography**: [PKI.js](https://pkijs.org/) and [ASN1.js](https://github.com/PeculiarVentures/ASN1.js) for certificate parsing and manipulation.


## Getting Started

Follow these steps to get the development environment running.

### Prerequisites

-   [Node.js](https://nodejs.org/) (version 20.19+ or 22.12+ required by Vite)
-   [pnpm](https://pnpm.io/) (version pinned in `package.json`)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd lamassuiot-pki-dashboard
    ```
3.  Enable pnpm through Corepack and install the dependencies:
    ```bash
    corepack enable
    pnpm install
    ```

Use `pnpm install --frozen-lockfile` in CI. Commit `pnpm-lock.yaml` when dependencies change. If migrating an existing checkout, remove the old `node_modules` directory before installing with pnpm. Dependency patches should use `pnpm patch` and `pnpm patch-commit`.

### Running the Development Server

To start the development server, run the following command:

```bash
pnpm run dev
```

The application will be available at [http://localhost:9002](http://localhost:9002).

## Configuration

The application can be configured at runtime by creating and modifying a `public/config.js` file. This file allows you to customize the application's behavior without needing to rebuild it.

Create a `config.js` file inside the `public/` directory with the following structure:

```javascript
window.lamassuConfig = {
  // The base URL for all backend API services.
  LAMASSU_API: "https://your-api-endpoint.example.com",

  // (Optional) An override URL for public-facing endpoints like VA (OCSP/CRL) and EST.
  // If not provided, these endpoints will be based on the LAMASSU_API value.
  // Useful if validation/enrollment services are hosted on a separate public domain.
  LAMASSU_PUBLIC_API: "https://your-public-endpoint.example.com",

  // (Optional) Enable the experimental browser terminal.
  EXPERIMENTAL_WBTERM: false,

  // (Optional) Wisp proxy for outbound traffic from the browser terminal.
  LAMASSU_TERMINAL_WISP_URL: "wss://wisp.example.com/",

  // --- Authentication ---
  // Set to `false` to disable OIDC authentication for local development.
  // Defaults to `true`.
  LAMASSU_AUTH_ENABLED: true,

  // The URL of your OpenID Connect (OIDC) identity provider.
  // Required if LAMASSU_AUTH_ENABLED is true.
  LAMASSU_AUTH_AUTHORITY: "https://your-oidc-provider.example.com/auth/realms/my-realm",

  // The client ID for the frontend application registered with your OIDC provider.
  // Defaults to "frontend".
  LAMASSU_AUTH_CLIENT_ID: "frontend-client-id",

  // --- Integrations ---
  // An array of strings defining available platform connectors for integrations. These connectors ID must be already recognized by the Lamassu backend.
  LAMASSU_CONNECTORS: ["aws.us-east-1.123456789012"],

  // --- UI Customization ---
  // Set to `true` to enable a custom HTML footer loaded from `public/footer.html`.
  // If enabled, the content of `public/footer.html` will be rendered at the bottom of the main content area.
  // This allows for adding static content like copyright notices, links, or disclaimers.
  // The `footer.html` file should contain valid HTML markup for the footer content.
  // If the file does not exist or LAMASSU_FOOTER_ENABLED is false, no footer will be displayed.
  // Defaults to `false`.
  LAMASSU_FOOTER_ENABLED: false
};
```

### Browser terminal

The terminal is disabled by default. Enable it with `EXPERIMENTAL_WBTERM: true` in `public/config.js` or by passing `-e EXPERIMENTAL_WBTERM=true` to Docker.

The app bar opens an Debian Linux terminal powered by [unkernel](https://github.com/pithings/unkernel). It requires a browser with WebAssembly JSPI; without it, the terminal explains why and downloads nothing. The kernel comes with the `unkernel` npm package and is part of the build. The Debian image is not: the image `debian.erofs` of the [pinned unkernel release](https://github.com/pithings/unkernel/releases/tag/v0.2.0-261119-97d7945) (v0.2.0-261119-97d7945) is not in this repository and must be provided at `/terminal/debian.erofs`, for example by downloading it into `public/terminal/` before the build (its licence texts are already there). Without it the terminal cannot boot.

The terminal is the shell of the public unkernel release, inside the dashboard's dock: the same boot steps, the same status line (terminal windows, `^A`, data disk, memory, Errors, Suspend and Resume, Reboot, About, Kernel log, System) and the same Options. Options are saved in the browser's `localStorage` (`kw.settings`) and apply at the next Reboot. The data disk and a suspended session are kept in the browser's IndexedDB, so they survive closing the terminal and reloading the page. The data disk holds `/data` and your changes to the system (installed packages, files in `/root`); `/tmp` starts empty at each boot. Clear it from the terminal's Guest tab (Reset) or with the browser's site data. Demos, the launcher, the guest display, audio and preview are not included.

The `^A` (Ctrl-A) shortcuts and the other terminal keys apply only while the terminal has focus. Elsewhere in the dashboard, Ctrl-A keeps its usual meaning.

The terminal reaches the network through a Wisp proxy. The Docker image bundles one ([wisp-js](https://github.com/MercuryWorkshop/wisp-js)) that nginx exposes at `/wisp/` on the dashboard's own origin, so the terminal works with no extra service or origin allow list. While it runs, `LAMASSU_TERMINAL_WISP_URL` defaults to `/wisp/` (a path is resolved to `ws(s)://<dashboard host>/wisp/`). It runs only when `EXPERIMENTAL_WBTERM` is `true`. These variables tune it:

| Variable | Default | Effect |
| --- | --- | --- |
| `WISP_ENABLED` | `true` | `false` does not start the bundled server. Set `LAMASSU_TERMINAL_WISP_URL` to another proxy, or the terminal has no network. |
| `WISP_ALLOW_PRIVATE_IPS` | `false` | `true` lets the terminal reach private addresses, needed when the EST gateway is on an internal network. Loopback stays blocked. |
| `WISP_OPTIONS` | unset | Raw [wisp-js options](https://github.com/MercuryWorkshop/wisp-js) as JSON, for example `{"allow_private_ips":true,"port_whitelist":[443]}`. Replaces `WISP_ALLOW_PRIVATE_IPS`. |
| `LAMASSU_TERMINAL_WISP_URL` | `/wisp/` | The Wisp server the terminal uses by default. Wisp servers saved in the terminal's Options win over it. |

The bundled proxy accepts WebSocket requests only when the Origin matches the public scheme and Host. When TLS terminates upstream, the trusted ingress must preserve Host and overwrite `X-Forwarded-Proto` with `http` or `https`. This origin check does not authenticate clients: put `/wisp/` behind an authenticating proxy or restrict network access to it. Any client that can reach the endpoint and supply a matching Origin can open connections to public addresses (private and loopback ones are blocked by default). Restrict it with `WISP_OPTIONS` (`hostname_whitelist`, `port_whitelist`) if that is too broad. Outside Docker (`pnpm run dev`) there is no bundled server: run one (`npx -p @mercuryworkshop/wisp-js wisp-js-server --port 5001`) and set `LAMASSU_TERMINAL_WISP_URL: "ws://localhost:5001/"` in `public/config.js`. Without it the terminal falls back to unkernel's default Wisp servers, which accept only known origins.

**Send to terminal** from EST Enroll prepares `enroll.sh` in a private working directory in the guest. Copy the command shown in the dock and run it in the terminal. If you skipped bootstrap issuance, supply `bootstrap.crt` and `bootstrap.key` in that directory before running the script.

## Available Scripts

-   `pnpm run dev`: Starts the application in development mode with hot-reloading.
-   `pnpm run build`: Creates an optimized production build of the application.
-   `pnpm run start`: Previews the production build locally. Use Nginx for production.
-   `pnpm run lint`: Runs ESLint to identify and report on patterns in the code.
-   `pnpm run fix`: Runs ESLint and automatically fixes fixable issues.
-   `pnpm run typecheck`: Runs the TypeScript compiler to check for type errors.

## Production build

Create an optimized static build and verify it locally:

1. Install clean dependencies and build:
```bash
pnpm install --frozen-lockfile
pnpm run build
```
The static build is written to the out/ directory. Static hosts must serve `index.html` for client routes; the included Nginx config already does this.

Preview the static output locally with SPA route fallback:
```bash
pnpm run start
```
The site will be available at http://localhost:9002.

Notes:

- Runtime configuration is injected by the container entrypoint from config.js.tmpl into /var/www/html/config.js. For local testing, edit public/config.js before building (or create out/config.js after building) so the app can read runtime settings without Docker.

- For production deployment prefer the provided Docker image (see "Running with Docker") which builds and serves the out/ export and injects runtime config at container start.

## Running with Docker

The image builds the static Vite site and serves it with Nginx. At container startup the entrypoint uses the `config.js.tmpl` file and replaces template variables from environment variables to produce `/var/www/html/config.js`.

Quick steps:

1. Build the image
```bash
docker build -t lamassu-ui:latest .
```

2. Run the container (example)
```bash
docker run -d \
  -p 9002:8085 \
  -e LAMASSU_API="https://api.example.com" \
  -e OIDC_ENABLED=true \
  -e OIDC_AUTHORITY="https://auth.example.com/realms/your-realm" \
  -e OIDC_CLIENT_ID="frontend" \
  -e CLOUD_CONNECTORS='["aws.us-east-1.123456789012"]' \
  -e UI_FOOTER_ENABLED=false \
  --name lamassu-ui \
  lamassu-ui:latest
```
The app will be available at http://localhost:9002.

Notes:
- The entrypoint runs envsubst against `/tmpl/config.js.tmpl` and writes `/var/www/html/config.js`. Provide any runtime config via environment variables listed above.
- To enable a custom footer, mount `footer.html` into the container and set `UI_FOOTER_ENABLED=true`:
```bash
docker run -d -p 9002:8085 \
  -v /local/path/footer.html:/var/www/html/footer.html:ro \
  -e UI_FOOTER_ENABLED=true \
  lamassu-ui:latest
```

### Custom Themes

Themes live in the exported site's public directory under `public/themes`. A theme is a CSS file and may reference additional resources (images, fonts) relative to `/themes/<theme-name>/...`.

Activation mechanism
- To activate a theme at runtime the container must expose a file `/var/www/html/custom-theme.css`. That file must reference (import/link) the actual theme CSS and any assets. Example contents of `custom-theme.css`:
```css
/* activate mytheme which lives under /themes/mytheme/ */
@import url("/themes/mytheme/style.css");
```

To enable a theme at container runtime, mount theme files and activation file into the container
```bash
docker run -d -p 9002:8085 \
  -v /local/path/theme/mytheme:/var/www/html/themes/mytheme:ro \
  -v /local/path/custom-theme.css:/var/www/html/custom-theme.css:ro \
  -e LAMASSU_API="https://api.example.com" \
  --name lamassu-ui \
  lamassu-ui:latest
```
- Place theme assets under `/local/path/themes/<theme-name>/`.
- `custom-theme.css` should import `/themes/<theme-name>/style.css` and can contain overrides.

## Developer-only menu options

Some navigation items in the app are marked as developer-only. These are controlled by a `devOnly: true` flag in the navigation configuration (see `src/app/layout.tsx` → `navigationConfig`). By default these items are hidden in production.

How the toggle works
- Developer-only items are shown when either:
  - `import.meta.env.DEV` is true (local dev server), OR
  - `VITE_FORCE_DEV_OPTIONS` is set (truthy) when building.
- Groups with all items filtered out are automatically hidden.

Enable developer-only items
- Local development
  - Run the dev server (`pnpm dev`) — items appear automatically.
- Forcing in non-development environments
  - Set `VITE_FORCE_DEV_OPTIONS=1` when building, then preview or deploy that build.
  - Example (Linux/macOS): `VITE_FORCE_DEV_OPTIONS=1 pnpm run build && pnpm run start`

Adding a dev-only menu item
- Example snippet from `src/app/layout.tsx`:
```ts
{
  label: 'KMS',
  items: [
    { href: '/kms/keys', label: 'Keys', icon: KeyRound, devOnly: true }, // will be hidden unless dev mode / forced
    { href: '/crypto-engines', label: 'Crypto Engines', icon: Cpu },
  ],
}
```

Notes
- Vite embeds `VITE_FORCE_DEV_OPTIONS` in the bundle. Changing it requires a rebuild. Runtime API and OIDC settings remain in `config.js`.
- Use dev-only items for debugging, feature preview, or tools that should not be exposed

## Security

To report a security vulnerability, do **not** open a public issue — follow
[SECURITY.md](./SECURITY.md) instead.

## License

This project is licensed under the Mozilla Public License 2.0 (MPL 2.0). See the `LICENSE` file for more details.
