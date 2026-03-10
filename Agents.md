# Agent Instructions for Lamassu Dashboard

## Purpose

Lamassu Dashboard is a Next.js and TypeScript UI for PKI, certificate lifecycle, device identity, registration authorities, validation authorities, and KMS-backed key management.

This file is intentionally concise. It should capture repo-specific engineering guidance without duplicating the detailed UI rules now documented in `storybook/`.

## Source of truth for UI work

Do not restate styling rules in feature files or duplicate design-system guidance here.

Use these documents as the canonical reference before changing or adding UI:

- `storybook/styles.md`
- `storybook/component-inventory.md`
- `storybook/ui-review-checklist.md`

**Core Directory Layout:**
```
├── src/
│   ├── app/                           # Next.js App Router pages
│   │   ├── certificate-authorities/   # CA management pages
│   │   │   ├── details/               # CA details and operations
│   │   │   ├── issue-certificate/     # Certificate issuance workflow
│   │   │   ├── new/                   # CA creation
│   │   │   └── requests/              # CA certificate requests
│   │   ├── certificates/              # Certificate management
│   │   │   └── details/               # Certificate details and operations
│   │   ├── registration-authorities/  # RA management
│   │   │   ├── cacerts/               # RA CA certificates
│   │   │   └── new/                   # RA creation
│   │   ├── verification-authorities/  # VA management
│   │   ├── devices/                   # Device identity management
│   │   │   └── details/               # Device details and certificates
│   │   ├── signing-profiles/          # Certificate signing profiles
│   │   │   ├── edit/                  # Profile editing
│   │   │   └── new/                   # Profile creation
│   │   ├── integrations/              # Platform integrations
│   │   │   ├── configure/             # Integration configuration
│   │   │   └── new/                   # New integration setup
│   │   ├── crypto-engines/            # Crypto engine management
│   │   ├── kms/keys/                  # Key management service
│   │   ├── alerts/                    # System alerts and notifications
│   │   ├── tools/certificate-viewer/  # Certificate inspection tools
│   │   └── settings/                  # Application settings
│   ├── components/                    # React components
│   │   ├── alerts/                    # Alert management components
│   │   ├── ca/                        # CA-specific components
│   │   ├── devices/                   # Device management components
│   │   ├── home/                      # Dashboard home components
│   │   ├── shared/                    # Shared utility components
│   │   └── ui/                        # Base UI components (ShadCN)
│   ├── contexts/                      # React contexts
│   │   └── AuthContext.tsx            # OIDC authentication context
│   ├── hooks/                         # Custom React hooks
│   ├── lib/                           # Core business logic
│   │   ├── actions/                   # Server actions
│   │   ├── alerts-api.ts              # Alerts API client
│   │   ├── api-domains.ts             # API endpoint configuration
│   │   ├── ca-data.ts                 # CA data and operations
│   │   ├── ca-utils.ts                # CA utility functions
│   │   ├── csr-utils.ts               # CSR parsing and utilities
│   │   ├── devices-api.ts             # Device API client
│   │   ├── dms-api.ts                 # DMS (RA) API client
│   │   ├── est-api.ts                 # EST protocol API client
│   │   ├── integrations-api.ts        # Platform integrations API
│   │   ├── va-api.ts                  # Validation Authority API
│   │   └── utils.ts                   # General utilities
│   ├── lib-crypto/                    # ALL low-level cryptographic operations (canonical location)
│   │   ├── index.ts                   # Public exports for all crypto utilities
│   │   ├── buffer-utils.ts            # Binary/buffer/PEM encoding helpers
│   │   ├── cert-parser.ts             # X.509 certificate parsing (PKI.js/ASN1.js)
│   │   ├── constants.ts               # Crypto algorithm constants and OIDs
│   │   ├── crl-parser.ts              # CRL parsing (PKI.js/ASN1.js)
│   │   ├── csr-builder.ts             # PKCS#10 CSR construction (PKI.js)
│   │   ├── csr-parser.ts              # CSR parsing and validation (PKI.js/ASN1.js)
│   │   ├── ecdsa-signature.ts         # ECDSA signature utilities
│   │   ├── engine.ts                  # Crypto engine abstraction
│   │   ├── key-utils.ts               # RSA/ECDSA key generation and handling
│   │   └── ocsp.ts                    # OCSP request/response parsing
│   └── types/                         # TypeScript type definitions
│       ├── certificate.ts             # Certificate-related types
│       └── crypto-engine.ts           # Crypto engine types
├── public/                            # Static assets
│   ├── config.js                      # Runtime configuration
│   ├── footer.html                    # Custom footer content
│   ├── themes/                        # Custom theme assets
│   └── wasm_exec.js                   # WebAssembly execution support
├── config.js.tmpl                     # Configuration template for Docker
├── docker-entrypoint.sh               # Container startup script
├── Dockerfile                         # Multi-stage Docker build
├── nginx.conf                         # Nginx configuration for serving
├── next.config.ts                     # Next.js configuration
└── package.json                       # Dependencies and scripts
```

Expectations:

- reuse `src/components/ui/*` primitives before creating new ones
- reuse `src/components/shared/*` patterns before creating local variants
- follow the existing page recipes documented in `storybook/styles.md`
- when a pattern will likely recur, extract it instead of creating another one-off implementation

**Key Integration Points:**
- **Authentication:** `src/contexts/AuthContext.tsx` handles OIDC integration
- **API Layer:** `src/lib/api-domains.ts` configures backend service endpoints
- **Certificate Operations:** `src/lib/ca-data.ts` and `src/lib/csr-utils.ts`
- **Low-level Crypto:** `src/lib-crypto/` — **⚠️ ALWAYS check and use this before writing any crypto code. Adding crypto logic anywhere else is forbidden.**
- **UI Components:** `src/components/ui/` contains ShadCN base components

## High-level architecture

Core areas:

- `src/app/`: Next.js App Router pages
- `src/components/ui/`: base UI primitives
- `src/components/shared/`: reusable app-level components and workflows
- `src/lib/`: API clients, PKI helpers, and domain logic
- `src/contexts/`: React contexts such as auth and identifier display
- `src/types/`: shared TypeScript types

Key domains:

- certificate authorities
- issued certificates
- registration authorities
- verification authorities
- devices
- signing profiles
- integrations
- crypto engines
- KMS keys

## Development workflow

Common commands:

```bash
npm run dev
npm run lint
npm run fix
npm run typecheck
npm run build
```

Before shipping changes:

- run `npm run typecheck`
- run `npm run lint` when relevant
- run `npm run build` when the change affects routing, exports, or broader app behavior

## Implementation rules

### Next.js and React

- prefer Server Components where possible, Client Components where interaction requires them
- keep page logic close to the route, and move reusable UI into `src/components/shared/`
- use typed API and domain models from `src/types/` and `src/lib/`

### PKI and certificate handling

- validate and sanitize certificate, CSR, and metadata inputs
- treat private key handling as sensitive by default
- never expose secrets, tokens, or private keys in logs or UI state unnecessarily
- preserve cryptographic correctness over convenience in certificate parsing, issuance, revocation, and validation flows

### UI composition

- default to semantic tokens from `src/app/globals.css` and `tailwind.config.ts`
- do not introduce new card, badge, tab, or hero variants when an existing shared pattern already fits
- if you need a one-off variant of an existing shared component, prefer extending the shared component instead

**Certificate Management Development:**
> ⚠️ All of the operations below are already implemented in `src/lib-crypto/`. You must use those implementations — do not call `pkijs` or `asn1js` directly from outside that folder.
- **CSR Generation**: `csr-builder.ts` in `lib-crypto` — do not reimplement
- **Certificate Parsing**: `cert-parser.ts` in `lib-crypto` — do not reimplement
- **PEM/DER Handling**: `buffer-utils.ts` in `lib-crypto` — do not reimplement
- **Validation**: Use functions from `cert-parser.ts` for chain validation and expiry checking

### Performance and UX

- avoid unnecessary repeated API calls
- use pagination for large result sets
- keep loading, empty, and error states explicit
- do not block the UI thread with heavy synchronous parsing or cryptographic work

## Documentation policy

When you add a reusable UI pattern or standardize a page pattern:

- update the relevant file in `storybook/`
- avoid duplicating the same rule in multiple markdown files
- if a new shared component becomes part of the standard toolkit, add it to `storybook/component-inventory.md`

## Practical rule

If you are about to build a new UI pattern, stop and check:

1. Is there already a primitive for this in `src/components/ui/`?
2. Is there already a shared version in `src/components/shared/`?
3. Is there already a documented pattern in `storybook/styles.md`?

If the answer to any of those is yes, reuse or extend it instead of reimplementing it.

---

## ⚠️ CRITICAL — Cryptographic Operations: `src/lib-crypto/` Is the ONE Canonical Location

> ### 🚨 STOP BEFORE WRITING ANY CRYPTO CODE
>
> **This rule is non-negotiable and applies to every contributor and every automated agent without exception.**
>
> Before writing — or even drafting — any code that touches cryptographic operations, certificate handling, key management, encoding, or anything that imports `pkijs` or `asn1js`, you **MUST** fully read `src/lib-crypto/index.ts` and the relevant implementation files to check whether the functionality already exists.
>
> - **If it exists → use it. Do not rewrite it. Do not write a "similar" version.**
> - **If it does not exist → add it to `src/lib-crypto/`. Nowhere else.**
>
> Placing crypto logic in `src/lib/`, components, pages, or hooks is **strictly forbidden**, regardless of how small or "one-off" the operation seems.

### What Belongs in `src/lib-crypto/`

Any code that directly uses `pkijs`, `asn1js`, the Web Crypto API (`crypto.subtle`), or that manipulates raw certificate/key/signature bytes **must live here**. Examples:

- Certificate parsing and field extraction — subject, issuer, validity, extensions, SANs, key usage
- CSR parsing, building, and validation
- CRL and OCSP parsing and construction
- RSA and ECDSA key generation and export
- ECDSA signature encoding/decoding
- PEM ↔ DER ↔ binary buffer conversions
- Crypto algorithm constants and OIDs
- Any helper that calls `new pkijs.Certificate()`, `new asn1js.Sequence()`, `crypto.subtle.*`, or equivalent

### What Is Already Implemented — Read These Before Writing Anything

| File | Responsibility |
|------|----------------|
| `index.ts` | Re-exports everything — **start here**: `import { ... } from "@/lib-crypto"` |
| `cert-parser.ts` | X.509 certificate parsing: subject, issuer, validity, extensions, SANs, key usage |
| `csr-builder.ts` | PKCS#10 CSR construction with browser-side key generation |
| `csr-parser.ts` | CSR parsing and validation |
| `crl-parser.ts` | CRL parsing |
| `ocsp.ts` | OCSP request/response construction and parsing |
| `key-utils.ts` | RSA/ECDSA key generation and export |
| `ecdsa-signature.ts` | ECDSA signature encode/decode utilities |
| `buffer-utils.ts` | PEM encoding, DER conversion, base64 helpers |
| `constants.ts` | Algorithm OIDs, crypto constants |
| `engine.ts` | Crypto engine abstraction |

### Mandatory Checklist — Non-Negotiable Before Writing Any Crypto Code

> Skipping any step is a violation of these contribution rules.

1. **Read `src/lib-crypto/index.ts`** — get a full picture of every exported symbol
2. **Read the relevant implementation file(s)** listed above — confirm whether the operation is already covered, even partially
3. **Only if genuinely absent** — add the new function to the correct `src/lib-crypto/` file; update `index.ts` exports accordingly
4. **Never** import `pkijs` or `asn1js` outside of `src/lib-crypto/`
5. **Never** duplicate or wrap an existing `lib-crypto` function — call it directly
6. **Never** write inline certificate/key/buffer manipulation in a component, page, hook, or `src/lib/` file

---

### OIDC Authentication Integration
Lamassu Dashboard uses **oidc-client-ts** for OpenID Connect authentication:

- **User Management**: Handle user login, logout, and session management
- **Token Management**: Automatic token refresh and storage
- **Silent Renewal**: Background token renewal to maintain sessions
- **Provider Support**: Compatible with various OIDC providers (Keycloak, Auth0, etc.)
- **Security**: Secure token storage and PKCE flow support

**Key Integration Points:**
- `src/contexts/AuthContext.tsx`: Main authentication context and user management
- `src/app/signin-callback/`: OIDC sign-in callback handling
- `src/app/signout-callback/`: OIDC sign-out callback handling
- `src/app/silent-renew-callback/`: Silent token renewal callback

### Configuration Management
The application supports runtime configuration through multiple mechanisms:

**Runtime Configuration (`public/config.js`):**
- **API Endpoints**: Configure backend service URLs
- **Authentication**: OIDC provider settings and client configuration
- **Features**: Enable/disable features like custom footer and developer options
- **Integrations**: Configure available platform connectors

**Docker Configuration (`config.js.tmpl`):**
- **Environment Variables**: Inject configuration at container startup
- **Template Processing**: Use envsubst for environment variable substitution
- **Deployment Flexibility**: Different configurations per environment

**Development Configuration:**
- **Local Development**: Direct configuration in `public/config.js`
- **Environment Variables**: Next.js environment variable support
- **Feature Toggles**: Developer-only menu items and debugging features

### Common Patterns
- Use `useAuth()` hook for authentication state and operations
- Implement proper loading states with Skeleton components
- Use React Hook Form for complex form validation
- Follow the ShadCN UI component composition patterns
- Implement proper error boundaries and fallback UI
- Use TypeScript strict mode for enhanced type safety

### Communication Guidelines
When contributing to Lamassu Dashboard, maintain clear and user-focused communication:

**Code & Documentation:**
- Write self-documenting code with meaningful component and function names
- Keep comments focused on complex PKI logic and business rules
- Use clear, descriptive commit messages that explain user-facing changes
- Structure PR descriptions with context, changes made, and testing approach

**Error Messages:**
- Provide actionable error messages that guide users toward solutions
- Include relevant context (certificate names, CA information, validation errors)
- Use plain language that both developers and PKI operators can understand
- Suggest next steps or point to documentation when appropriate

**PKI Operations:**
- Write clear validation messages for certificate and CSR operations
- Include specific details about what validation failed and why
- Provide examples of correct certificate formats when possible
- Use consistent terminology aligned with PKI standards and industry practices

**Response Style:**
- Provide actionable error messages that guide users toward solutions
- Include relevant context (resource names, paths, constraint violations)
- Use plain language that both developers and operators can understand
- Suggest next steps when appropriate

## CI/CD & Validation

**Development Workflow:**
- **Type Safety** - TypeScript strict mode catches errors at compile time
- **Code Quality** - ESLint with Next.js configuration ensures consistent style
- **Build Validation** - Static export process validates entire application

**Pre-commit Validation:**
1. **Always run `npm run typecheck`** - ensures TypeScript compilation succeeds
2. **Always run `npm run lint`** - catches style and potential logic issues
3. **Test critical PKI workflows** - certificate creation, validation, and revocation
4. **Verify responsive design** - test on mobile and desktop viewports
5. **Check `npm run build`** - ensures static export generation succeeds
6. **Review for refactoring opportunities** - flag or address duplication and dead code found during the change

**Docker Validation:**
- **Multi-stage build process** - optimizes for production deployment
- **Static file serving** - Nginx configuration for optimal performance
- **Runtime configuration** - Environment variable injection at container startup

**Performance Requirements:**
- **Build time must complete in <5 minutes** on standard hardware
- **Page load times should be <2 seconds** for cached content
- **Certificate operations should provide immediate feedback** with loading states

**Common Validation Failures:**
- **Type errors:** Usually missing type definitions or incorrect imports
- **Build failures:** Often related to missing dependencies or incorrect configurations
- **Docker issues:** Typically file permissions or missing build context files
- **Runtime configuration:** Missing or incorrect API endpoint configurations

**Security & Performance Notes:**
- **All certificate data requires validation** - never trust client-provided PKI data
- **Private key operations must be secure** - generate client-side only when appropriate
- **API authentication is mandatory** - all backend calls require valid OIDC tokens
- **Never expose sensitive configuration** - use environment variables for secrets

Trust these instructions completely for development and deployment operations. Only search for additional information if these specific patterns fail or if working on areas not covered above.
