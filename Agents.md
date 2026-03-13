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

Expectations:

- reuse `src/components/ui/*` primitives before creating new ones
- reuse `src/components/shared/*` patterns before creating local variants
- follow the existing page recipes documented in `storybook/styles.md`
- when a pattern will likely recur, extract it instead of creating another one-off implementation

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
