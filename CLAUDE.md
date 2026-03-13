# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lamassu Dashboard is a Next.js 15 web UI for managing X.509 certificates and PKI infrastructure (CAs, RAs, VAs, devices, and authorization policies). It is deployed as a static export served by Nginx in Docker.

## Commands

```bash
npm run dev          # Development server with Turbopack on port 9002
npm run build        # Production static export to out/
npm run lint         # ESLint analysis
npm run fix          # ESLint auto-fix
npm run typecheck    # TypeScript type checking (run before committing)
```

No automated test suite — validation relies on `typecheck`, `lint`, and `build`.

**Always run `npm run typecheck` and `npm run lint` before committing.**

## Architecture

### Static Export + Runtime Configuration

The app uses `output: 'export'` in `next.config.ts` — no API routes or server-side rendering. Configuration is injected at runtime via `public/config.js` (populated from `config.js.tmpl` by `docker-entrypoint.sh`). Key config values:

- `LAMASSU_API` — backend API base URL
- `LAMASSU_AUTH_ENABLED` / `LAMASSU_AUTH_AUTHORITY` / `LAMASSU_AUTH_CLIENT_ID` — OIDC settings

For local dev, edit `public/config.js` directly.

### API Layer (`src/lib/`)

All backend calls go through domain-specific API clients. `api-domains.ts` resolves base URLs from `window.lamassuConfig`. Clients:

- `ca-data.ts` — Certificate Authorities
- `dms-api.ts` — Registration Authorities (DMS)
- `devices-api.ts` — IoT devices
- `device-groups-api.ts` — Device groups
- `kms-data.ts` — Key Management Service
- `va-api.ts` — Validation Authority
- `est-api.ts` — EST protocol
- `alerts-api.ts` — Alerts/notifications
- `integrations-api.ts` — Platform integrations (AWS KMS, etc.)
- `authz-api.ts` — Authorization policies and principals

All clients use a shared `handleApiError()` pattern for consistent error handling.

### Authentication (`src/contexts/AuthContext.tsx`)

OIDC via `oidc-client-ts`. The `useAuth()` hook provides the user session and bearer token. OIDC callback routes: `/signin-callback`, `/signout-callback`, `/silent-renew-callback`. Auth can be disabled via config (no OIDC provider needed).

### State Management

No external state library. Uses React Context for:
- `AuthContext` — OIDC session
- `ConfigContext` — runtime configuration (polls for `window.lamassuConfig` on load)
- `IdentifierDisplayContext` — user display preferences

### Cryptography

Browser-side PKI operations use `pki.js` and `asn1.js`:
- CSR generation and parsing: `src/lib/csr-utils.ts`
- CA utilities and chain validation: `src/lib/ca-utils.ts`
- Private key generation happens client-side only

### Component Structure

- `src/components/ui/` — ShadCN base components (do not modify directly)
- `src/components/shared/` — cross-cutting components (status badges, dialogs)
- `src/components/<feature>/` — feature-specific components (ca/, devices/, authz/, etc.)
- `src/app/` — Next.js App Router pages; pages are thin wrappers, logic lives in components and lib

### Authorization v2

The current branch (`feat/authz-v2`) adds policy-based access control. Key files:
- `src/types/authz.ts` — principal types (API key, OIDC, X.509), policy models
- `src/lib/authz-api.ts` — capabilities, policy, and principal endpoints
- Navigation items use a `uiAuthzCapabilities` property to hide UI elements based on permissions

## Development Guidelines

### File Conventions

- Always include a newline at the end of every file.
- Use `@/*` path alias for imports (maps to `src/*`).

### Refactoring

Actively reduce duplication when you encounter it. Known hotspots:
- List pages (CAs, certificates, devices, RAs) share table/pagination/search logic
- Detail pages share header layout and action menu patterns
- Create/edit form pairs (`new/` and `edit/` directories) often share field definitions
- API clients have repeated fetch/auth-header patterns

When refactoring: extract to `src/components/shared/`, `src/hooks/`, or `src/lib/utils.ts`. Validate with `typecheck` and `lint` after every refactor. Flag out-of-scope opportunities with `// TODO: refactor - duplicated in src/...` comments.

### PKI Operations

- Validate and sanitize all certificate data before processing
- Private key generation must remain client-side
- Use consistent PEM encoding/decoding (base64)
- Never expose private keys or tokens in logs or client state
