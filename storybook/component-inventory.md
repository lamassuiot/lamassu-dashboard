# Reusable Component Inventory

This is the curated list of UI building blocks that should be preferred before creating new components.

## Foundations

| Purpose | Component or file | Use it for |
| --- | --- | --- |
| Semantic colors and theme variables | `src/app/globals.css` | All colors, surfaces, radii, theme tokens |
| Tailwind token mapping | `tailwind.config.ts` | Color names, radius mapping, typography tokens |

## UI primitives

| Purpose | Path | Notes |
| --- | --- | --- |
| Buttons | `src/components/ui/button.tsx` | Use variants and sizes before introducing new button classes |
| Cards | `src/components/ui/card.tsx` | Base for most surfaced containers |
| Badges | `src/components/ui/badge.tsx` | Generic categorical or supporting labels |
| Tabs | `src/components/ui/tabs.tsx` | Base primitive for detail and tool tabs |
| Tables | `src/components/ui/table.tsx` | Canonical data table styling |
| Form primitives | `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx`, `src/components/ui/checkbox.tsx`, `src/components/ui/switch.tsx`, `src/components/ui/form.tsx` | Start here for all form controls |
| Overlays | `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`, `src/components/ui/drawer.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/popover.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/ui/tooltip.tsx` | Use these instead of custom overlay wrappers |
| Alerts | `src/components/ui/alert.tsx` | Inline warnings, errors, and guidance |
| Scrolling content | `src/components/ui/scroll-area.tsx` | PEM, JSON, long side panels |
| Breadcrumbs | `src/components/ui/breadcrumb.tsx`, `src/components/ui/breadcrumbs.tsx` | Navigation trails |

## Shared layout and page chrome

| Purpose | Path | Use instead of |
| --- | --- | --- |
| Breadcrumb row with actions | `src/components/shared/DetailBreadcrumbRow.tsx` | Ad hoc breadcrumb and button wrappers |
| Main area plus side panel | `src/components/shared/SplitPanelLayout.tsx` | Hand-rolled desktop/sidebar/mobile drawer layouts |
| Detail section card | `src/components/shared/DetailSectionCard.tsx` | Repeating KMS-style section card shells |
| Detail info rows | `src/components/shared/DetailInfoRows.tsx` | Repeating label/value row groups inside detail cards |
| Section header | `src/components/shared/FormComponents.tsx` | One-off icon/title/description headers |
| Switch row field | `src/components/shared/FormComponents.tsx` | Locally styled switch rows |
| Step indicator | `src/components/shared/Stepper.tsx` | Rebuilding multi-step flow indicators |

## Shared data and status display

| Purpose | Path | Use instead of |
| --- | --- | --- |
| API status badge | `src/components/shared/ApiStatusBadge.tsx` | Custom active/revoked/expired pills |
| Crypto engine renderer | `src/components/shared/CryptoEngineViewer.tsx` | Manually pairing engine icons and names |
| Identifier display | `src/components/shared/IdentifierDisplay.tsx` | Repeating copyable or mode-aware ID rendering |
| Date formatting | `src/components/shared/DateDisplay.tsx` | Rewriting relative/absolute date display logic |
| Key strength bars | `src/components/shared/KeyStrengthIndicator.tsx` | One-off crypto strength indicators |
| Tag input | `src/components/shared/TagInput.tsx` | Custom removable-chip tag editors |

## Shared detail content

| Purpose | Path | Notes |
| --- | --- | --- |
| Information tab body | `src/components/shared/details-tabs/InformationTabContent.tsx` | Strong reference for section-card details layout |
| PEM tab body | `src/components/shared/details-tabs/PemTabContent.tsx` | Use for certificate/chain viewers and PEM actions |
| Metadata tab body | `src/components/shared/details-tabs/MetadataTabContent.tsx` | Use for JSON metadata view/edit flows |
| Code viewer | `src/components/shared/CodeBlock.tsx` | Compact read-only code or CLI output blocks |

## Shared selectors and domain-specific builders

| Purpose | Path | Notes |
| --- | --- | --- |
| Signing profile selector | `src/components/shared/SigningProfileSelector.tsx` | Reuse/select/create profile flows |
| Signing profile form | `src/components/shared/SigningProfileForm.tsx` | Multi-section issuance profile creation/editing |
| Issuance profile card | `src/components/shared/IssuanceProfileCard.tsx` | Summary presentation for signing profiles |
| Crypto engine selector | `src/components/shared/CryptoEngineSelector.tsx` | Engine selection flows |
| KMS key selector | `src/components/shared/KmsKeySelector.tsx` | Picking existing keys |
| KMS key viewer | `src/components/shared/KmsKeyViewer.tsx` | Key identity display |
| Issuance chain visualizer | `src/components/shared/IssuanceChainVisualizer.tsx` | Chain of trust and hierarchy presentation |
| Certificate selector | `src/components/shared/CertificateSelectorModal.tsx` | Choosing certificates from the system |
| CA selector | `src/components/shared/CaSelectorModal.tsx` | Choosing CAs from the system |

## Shared modals and workflow components

Prefer the existing shared modal when the workflow already exists:

- `src/components/shared/RevocationModal.tsx`
- `src/components/shared/AssignIdentityModal.tsx`
- `src/components/shared/DecommissionDeviceModal.tsx`
- `src/components/shared/DeleteDeviceModal.tsx`
- `src/components/shared/DeleteCaModal.tsx`
- `src/components/shared/DeleteKmsKeyModal.tsx`
- `src/components/shared/AkiCaSelectorModal.tsx`
- `src/components/shared/ForceUpdateModal.tsx`
- `src/components/shared/MetadataViewerModal.tsx`

If a new flow is just a small variant of one of these, extend the existing component instead of creating a parallel modal.

## Canonical page references

Use these pages as visual references when building similar screens:

| Pattern | Reference |
| --- | --- |
| KMS-style detail sections | `src/app/kms/keys/details/KmsKeyDetailsClient.tsx` |
| Certificate detail layout | `src/app/certificates/details/CertificateDetailsClient.tsx` |
| Device detail layout | `src/app/devices/details/DeviceDetailsClient.tsx` |
| CA creation chooser | `src/app/certificate-authorities/new/page.tsx` |
| KMS creation chooser | `src/app/kms/keys/new/page.tsx` |
| Multi-card form sections | `src/app/signing-profiles/new/page.tsx` |

## Before creating a new component

Ask these questions:

1. Does `src/components/ui/*` already solve the primitive?
2. Does `src/components/shared/*` already solve the pattern?
3. Is this just a restyled `SectionHeader`, status badge, selector, modal, or viewer?
4. If I build this locally, will another page need the same thing in a month?

If the answer to the last question is "probably yes", it should likely be extracted or aligned with an existing shared component now.
