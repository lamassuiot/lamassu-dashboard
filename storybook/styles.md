# UI Style Guide

This folder is the shared styling guide for the Lamassu dashboard UI.

The goal is simple: build new screens by composing the existing primitives and shared patterns already present in the codebase, instead of re-inventing card shells, headers, badges, tabs, selectors, and detail layouts on every page.

## Why this exists

The codebase already has a usable visual language:

- semantic tokens in `src/app/globals.css`
- Tailwind mappings in `tailwind.config.ts`
- solid base primitives in `src/components/ui/*`
- recurring shared patterns in `src/components/shared/*`

What causes the UI to drift is not a lack of building blocks. It is inconsistent reuse.

This guide defines the canonical styles and the preferred components to use before building anything new.

## Core principles

### 1. Build product UI, not landing-page UI

Most screens in this app are operational tools. They should feel structured, calm, and information-dense.

Prefer:

- compact vertical rhythm
- clear sectioning
- understated surfaces
- meaningful icons
- buttons reserved for actions, not decoration

Avoid:

- oversized marketing cards
- decorative empty space
- competing accent colors
- CTA-heavy layouts inside product flows

### 2. Use semantic tokens first

Always build from the semantic color and surface variables already defined in `src/app/globals.css` and surfaced in `tailwind.config.ts`.

Preferred token families:

- `bg-background`, `text-foreground`
- `bg-card`, `text-card-foreground`
- `bg-muted`, `text-muted-foreground`
- `bg-primary`, `text-primary-foreground`
- `border-border`
- `ring-ring`

Do not introduce one-off hex colors unless the value is runtime-driven and cannot be represented with existing tokens.

### 3. One card language across the app

The strongest card style currently used in KMS details, certificate flows, and newer forms should be the default:

- outer shell: `overflow-hidden rounded-xl shadow-sm`
- header: `border-b py-4`
- title row: `flex items-center text-lg`
- body spacing: `p-6`

If a new page needs a section card, start from this style.

### 4. Reuse patterns, not just primitives

Using `Card` alone is not enough. Reuse the higher-level patterns that already exist:

- section headers
- detail heroes
- detail tabs
- table-in-card layouts
- split panel layouts
- PEM and metadata viewers

### 5. Make state visible and consistent

Statuses, lifecycle, issuance, revocation, and crypto engine labels are core product concepts.

Use shared badge/rendering components when available instead of creating new pills, colored chips, or inline icon treatments.

## Foundation

### Design tokens

Canonical sources:

- `src/app/globals.css`
- `tailwind.config.ts`

Use these as the source of truth for:

- colors
- radii
- header height
- sidebar colors
- light and dark theme behavior

### Typography

Current typography is intentionally simple:

- `fontFamily.body`: `Inter`
- `fontFamily.headline`: `Inter`

Use:

- page titles: `text-3xl font-headline font-semibold`
- section titles: `text-lg`
- support copy: `text-sm text-muted-foreground`
- labels and metadata keys: uppercase or small muted labels only when they describe structured data

Do not invent alternative display typography per page.

### Radius and elevation

Default radius should come from the system and remain visually tight.

Prefer:

- `rounded-lg` for primitives
- `rounded-xl` for larger cards and section shells
- `shadow-sm` for surfaced cards

Avoid oversized radii that make admin pages feel toy-like.

## Canonical patterns

### Section card

Use this for most forms, details sections, summaries, and viewers.

Reference implementations:

- `src/components/shared/DetailSectionCard.tsx`
- `src/components/shared/FormComponents.tsx`
- `src/components/shared/SigningProfileForm.tsx`
- `src/components/shared/details-tabs/PemTabContent.tsx`
- `src/components/shared/details-tabs/InformationTabContent.tsx`

Expected structure:

1. `Card` with `overflow-hidden rounded-xl shadow-sm`
2. `CardHeader` with `border-b py-4`
3. title row with icon, title, optional secondary description
4. `CardContent` with `p-6`

For label/value content inside these cards, prefer:

- `src/components/shared/DetailInfoRows.tsx`

### Detail hero

Use for details pages where the entity identity and actions need to be visible at a glance.

Observed on:

- certificate details
- CA details
- KMS key details
- device details

Expected ingredients:

- single top summary surface
- entity icon or resource icon
- prominent title
- supporting badges
- right-aligned action cluster
- optional accent rule at the top

Do not create a different hero grammar for every resource type.

### Underline tabs for detail pages

Detail screens work better with lightweight, underline-style navigation than heavy boxed tabs.

Use this approach for:

- information
- PEM
- metadata
- history
- timeline
- related resources

The `Tabs` primitive is still the base, but the visual treatment should match the details-page tab pattern already used in certificate, CA, and device details.

### Chooser panel

For "choose a creation method" screens, use a single selection card with stacked rows.

Reference implementations:

- `src/app/kms/keys/new/page.tsx`
- `src/app/certificate-authorities/new/page.tsx`

Pattern:

- page title and helper copy outside the card
- one bordered panel
- each option is a row, not a mini landing card
- icon left, text center, chevron right
- optional badge for subtype or availability
- selection or navigation happens on click

Avoid three promotional cards with duplicate buttons.

### Table inside a surfaced section

Large data tables should usually sit inside a section card or detail section, not float directly on the page.

Use:

- table header background from the shared table primitive
- action column aligned consistently
- pagination controls visually tied to the table container

Reference primitive:

- `src/components/ui/table.tsx`

### Code, PEM, and metadata viewers

These are recurring product elements and should not be reimplemented from scratch.

Use:

- `src/components/shared/CodeBlock.tsx`
- `src/components/shared/details-tabs/PemTabContent.tsx`
- `src/components/shared/details-tabs/MetadataTabContent.tsx`

Principles:

- action buttons stay in the header
- content area uses scroll containers
- copy/download affordances stay compact
- code-like data should feel utilitarian, not decorative

### Split main/panel layout

When a screen needs a primary work area and a side panel, use:

- `src/components/shared/SplitPanelLayout.tsx`

Do not hand-roll sidebars and mobile drawers repeatedly.

## Reusable building blocks

### Always start with `src/components/ui/*`

Use the app primitives first:

- `button.tsx`
- `card.tsx`
- `badge.tsx`
- `tabs.tsx`
- `table.tsx`
- `input.tsx`
- `textarea.tsx`
- `select.tsx`
- `dialog.tsx`
- `sheet.tsx`
- `alert.tsx`
- `scroll-area.tsx`
- `tooltip.tsx`
- `breadcrumb.tsx`
- `breadcrumbs.tsx`

If the primitive exists, do not recreate it locally.

### Preferred shared components

Use these before building a new one-off component:

- `src/components/shared/FormComponents.tsx`
  - `SectionHeader`
  - `SwitchFormField`
- `src/components/shared/DetailBreadcrumbRow.tsx`
- `src/components/shared/SplitPanelLayout.tsx`
- `src/components/shared/ApiStatusBadge.tsx`
- `src/components/shared/CryptoEngineViewer.tsx`
- `src/components/shared/IdentifierDisplay.tsx`
- `src/components/shared/DateDisplay.tsx`
- `src/components/shared/TagInput.tsx`
- `src/components/shared/SigningProfileSelector.tsx`
- `src/components/shared/SigningProfileForm.tsx`
- `src/components/shared/IssuanceProfileCard.tsx`
- `src/components/shared/IssuanceChainVisualizer.tsx`
- `src/components/shared/KeyStrengthIndicator.tsx`

### Preferred detail content modules

Use existing detail tab content where possible:

- `src/components/shared/details-tabs/InformationTabContent.tsx`
- `src/components/shared/details-tabs/PemTabContent.tsx`
- `src/components/shared/details-tabs/MetadataTabContent.tsx`

These are already shaping how certificate and CA detail views behave. New detail pages should follow this direction instead of inventing a brand new anatomy.

## Do not reimplement these

### Status chips

Do not create new inline pills for:

- active
- expired
- revoked
- pending
- unknown

Use:

- `src/components/shared/ApiStatusBadge.tsx`
- `src/components/ui/badge.tsx`

### Section headers

Do not build custom icon-title-description rows in every form.

Use:

- `SectionHeader` from `src/components/shared/FormComponents.tsx`

### Crypto engine rendering

Do not manually pair engine icons, labels, and wrappers.

Use:

- `src/components/shared/CryptoEngineViewer.tsx`

### Detail breadcrumb row

Do not build new breadcrumb-and-actions wrappers in every details page.

Use:

- `src/components/shared/DetailBreadcrumbRow.tsx`

### Split side panel behavior

Do not create ad hoc responsive sidebars.

Use:

- `src/components/shared/SplitPanelLayout.tsx`

### PEM and raw JSON viewers

Do not re-create copy buttons, download buttons, scroll wrappers, and code blocks for PEM/JSON each time.

Use or extend:

- `PemTabContent`
- `MetadataTabContent`
- `CodeBlock`

## Anti-patterns to avoid

- custom card chrome when the KMS-style section card already fits
- duplicated badges with slightly different spacing and colors
- multiple visual tab systems on detail pages
- inline arbitrary colors for static UI states
- giant empty hero areas
- section titles outside cards when the page already uses card headers for hierarchy
- chooser screens implemented as marketing cards with duplicate CTA buttons
- new layout wrappers when `SplitPanelLayout` already matches the need

## Preferred page recipes

### Details page recipe

1. optional breadcrumb row via `DetailBreadcrumbRow`
2. hero summary card
3. underline tab navigation
4. each tab composed of section cards
5. tables and code viewers kept inside surfaced sections

### Form page recipe

1. page title and support copy
2. sections broken into separate cards
3. use `SectionHeader`
4. dense but readable spacing with `p-6`
5. sticky side panel only when the screen truly benefits from it

### Creation chooser recipe

1. page title outside the card
2. single selection panel
3. stacked rows
4. badges for subtype distinctions
5. click row to continue

## Current duplication risks

These patterns still deserve attention because they recur in multiple places:

- chooser rows are implemented more than once
- detail hero composition is repeated across resources

If you need one of these, prefer copying the existing pattern exactly or extracting a shared component instead of making a third variant.

## Recommended next extractions

These would reduce future drift:

1. `DetailTabs`
   - one shared visual treatment for underline-style detail navigation
2. `CreationMethodChooser`
   - one shared row-based chooser used by KMS and CA flows
3. `DetailHero`
   - one shared hero shell for resource details pages

## Definition of done for new UI

A new UI is aligned with this guide when:

- it uses existing tokens
- it reuses existing primitives
- it follows an existing page recipe where one exists
- it does not introduce a new visual grammar without a clear reason
- it improves reuse instead of adding another local-only pattern
