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

-   **Framework**: [Next.js](https://nextjs.org/) (App Router)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **UI Library**: [React](https://react.dev/)
-   **Component Library**: [ShadCN UI](https://ui.shadcn.com/)
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Authentication**: [OIDC Client](https://github.com/authts/oidc-client-ts) for OpenID Connect integration.
-   **Cryptography**: [PKI.js](https://pkijs.org/) and [ASN1.js](https://github.com/PeculiarVentures/ASN1.js) for certificate parsing and manipulation.


## Getting Started

Follow these steps to get the development environment running.

### Prerequisites

-   [Node.js](https://nodejs.org/) (version 20 or later recommended)
-   [npm](https://www.npmjs.com/) (usually comes with Node.js)

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd lamassuiot-pki-dashboard
    ```
3.  Install the dependencies:
    ```bash
    npm install
    ```

### Running the Development Server

To start the development server, run the following command:

```bash
npm run dev
```

The application will be available at [http://localhost:9002](http://localhost:9002).

## Configuration

The application can be configured at runtime by creating and modifying a `public/config.js` file. This file allows you to customize the application's behavior without needing to rebuild it.

Create a `config.js` file inside the `public/` directory with the following structure:

```javascript
window.lamassuConfig = {
  // The base URL for all backend API services.
  LAMASSU_API: "https://your-api-endpoint.example.com",

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

## Available Scripts

-   `npm run dev`: Starts the application in development mode with hot-reloading.
-   `npm run build`: Creates an optimized production build of the application.
-   `npm run start`: Starts a production server for the built application.
-   `npm run lint`: Runs ESLint to identify and report on patterns in the code.
-   `npm run fix`: Runs ESLint and automatically fixes fixable issues.
-   `npm run typecheck`: Runs the TypeScript compiler to check for type errors.

## Running with Docker

The image builds the static Next.js export and serves it with Nginx. At container startup the entrypoint uses the `config.js.tmpl` file and replaces template variables from environment variables to produce `/var/www/html/config.js`.

Quick steps:

1. Build the image
```bash
docker build -t lamassu-ui:latest .
```

2. Run the container (example)
```bash
docker run -d \
  -p 9002:80 \
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
docker run -d -p 9002:80 \
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
docker run -d -p 9002:80 \
  -v /local/path/theme/mytheme:/var/www/html/themes/mytheme:ro \
  -v /local/path/custom-theme.css:/var/www/html/custom-theme.css:ro \
  -e LAMASSU_API="https://api.example.com" \
  --name lamassu-ui \
  lamassu-ui:latest
```
- Place theme assets under `/local/path/themes/<theme-name>/`.
- `custom-theme.css` should import `/themes/<theme-name>/style.css` and can contain overrides.

## License

This project is licensed under the Mozilla Public License 2.0 (MPL 2.0). See the `LICENSE` file for more details.
