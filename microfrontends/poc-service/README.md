# PoC Service

Proof-of-concept microfrontend created from `microfrontends/template` following its README.
It has two pages (`/poc-service` and `/poc-service/detail`); the home page calls the backend
(`/ca/v1/stats`) with the token the dashboard hands to modules.

## Try it with the dashboard

1. Start the module: `pnpm --filter @lamassu/mfe-poc-service dev` (port 9010).
2. Add this entry to the `modules` array of the dashboard's `public/modules.json` (the file is
   committed empty; do not commit this change) and start the dashboard with `pnpm dev`:

   ```json
   {
     "name": "poc_service",
     "entry": "http://localhost:9010/remoteEntry.js",
     "basePath": "/poc-service",
     "nav": { "group": "ENTERPRISE", "label": "PoC Service", "icon": "flask-conical" }
   }
   ```

3. "PoC Service" appears in the sidebar under ENTERPRISE. Remove the entry and reload: it disappears,
   without rebuilding the dashboard.

`module.json` in this folder is the same fragment; in production its `entry` becomes
`/ui/modules/poc-service/remoteEntry.js`.
