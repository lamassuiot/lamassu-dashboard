# UI Review Checklist

Use this checklist before merging UI work.

## Reuse

- Did I check `src/components/ui/*` before creating a new primitive?
- Did I check `src/components/shared/*` before creating a new pattern component?
- Am I reusing `SectionHeader`, `ApiStatusBadge`, `CryptoEngineViewer`, `DateDisplay`, and other shared helpers where relevant?

## Styling

- Am I using semantic Tailwind tokens such as `bg-card`, `text-muted-foreground`, `border-border`, and `bg-primary/5`?
- Did I avoid new hard-coded colors unless the value is runtime-driven?
- Does the page use the established card language: `rounded-xl`, `shadow-sm`, `border-b` header, `p-6` content?

## Layout

- Is this page following an existing recipe: detail page, chooser page, or multi-section form?
- If the screen has a side panel, did I use `SplitPanelLayout`?
- If the screen has detail tabs, does it follow the lightweight underline tab treatment already used elsewhere?

## Content presentation

- Are tables inside surfaced sections instead of floating directly on the page?
- Are PEM, code, or JSON views using existing viewer patterns instead of custom wrappers?
- Are statuses represented consistently with shared badges or status components?

## Drift prevention

- Did I create a new local-only visual pattern that could have reused an existing one?
- If I introduced a new pattern, is it generic enough that it should move into `src/components/shared/*` now?
- Would another engineer know which existing pattern this screen belongs to just by looking at it?

## Red flags

If any of these are true, pause and refactor:

- a new custom card shell was added without a strong reason
- a new badge style was added for a status that already exists elsewhere
- a chooser page became a set of promotional CTA cards
- a details page invented a new hero, tab, or section structure
- a modal duplicates an existing workflow with only minor text changes
