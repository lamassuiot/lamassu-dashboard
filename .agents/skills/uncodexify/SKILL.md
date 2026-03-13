---
name: uncodexify
description: Prevents generic AI/Codex UI patterns when generating frontend code. Use this skill whenever generating React/Next.js/Tailwind/ShadCN UI code to enforce clean, human-designed aesthetics inspired by Linear, Raycast, Stripe, and GitHub instead of typical AI-generated UI.
---

# Uncodexify

This document exists to teach you how to act as non-Codex as possible when building UI.

Codex UI is the default AI aesthetic: soft gradients, floating panels, eyebrow labels, decorative copy, hero sections in dashboards, oversized rounded corners, transform animations, dramatic shadows, and layouts that try too hard to look premium. It's the visual language that screams "an AI made this" because it follows the path of least resistance.

This file is your guide to break that pattern. Everything listed below is what Codex UI does by default. Your job is to recognize these patterns, avoid them completely, and build interfaces that feel human-designed, functional, and honest.

When you read this document, you're learning what NOT to do. The banned patterns are your red flags. The normal implementations are your blueprint. Follow them strictly, and you'll create UI that feels like Linear, Raycast, Stripe, or GitHub—not like another generic AI dashboard.

This is how you Uncodexify.

## Tech Stack Context

This project uses **Next.js + React + Tailwind CSS + ShadCN UI**. Always follow these rules:

- **Use ShadCN components** — `<Card>`, `<Button>`, `<Badge>`, `<Table>`, `<Input>`, `<Select>`, `<Dialog>`, `<Sidebar>` etc. Never roll your own primitive styles from scratch.
- **Use Tailwind utilities** — spacing, color, radius, shadow, and typography must come from the configured Tailwind scale, not inline styles or raw CSS values.
- **Use project CSS variables via Tailwind color tokens** — `bg-primary`, `text-foreground`, `bg-card`, `border`, `text-muted-foreground`, `bg-secondary`, `text-destructive`, etc. Never hardcode hex or HSL values.
- **Font**: This project uses **Inter**. Do not change or override the font stack.
- **Border radius**: Controlled by `--radius: 0.5rem`. Use `rounded-sm`, `rounded-md`, `rounded-lg` — never arbitrary `rounded-[20px]` or larger.
- **Sidebar**: Use ShadCN's `<SidebarProvider>` / `<Sidebar>` / `<SidebarContent>` component system. Do not build a custom sidebar.

## Keep It Normal (Uncodexy-UI Standard)

- Sidebars: normal (use ShadCN `<Sidebar>` component, solid background via `bg-sidebar`, simple border via `border-r border-sidebar-border`, no floating shells, no rounded outer corners)
- Headers: normal (simple text, no eyebrows, no uppercase labels, no gradient text, just h1/h2 with proper hierarchy)
- Sections: normal (standard padding 20-30px, no hero blocks inside dashboards, no decorative copy)
- Navigation: normal (simple links, subtle hover states, no transform animations, no badges unless functional)
- Buttons: normal (use ShadCN `<Button variant="default|outline|ghost|destructive">`, no pill shapes, no gradient backgrounds)
- Cards: normal (use ShadCN `<Card>` with `<CardHeader>`, `<CardContent>`, `<CardFooter>`, no shadows over 8px blur, no floating or glassmorphism effect)
- Forms: normal (use ShadCN `<Input>` / `<Label>` / `<Select>` / React Hook Form, clear labels above fields, no fancy floating labels, simple focus states)
- Inputs: normal (use ShadCN `<Input>`, solid borders via `border-input`, simple focus ring via `ring-ring`, no animated underlines)
- Modals: normal (use ShadCN `<Dialog>` with `<DialogHeader>` / `<DialogContent>`, no slide-in animations, straightforward close)
- Dropdowns: normal (use ShadCN `<DropdownMenu>` or `<Select>`, subtle shadow, no fancy animations, clear selected state)
- Tables: normal (use ShadCN `<Table>` / `<TableHeader>` / `<TableRow>` / `<TableCell>`, subtle hover via `hover:bg-muted/50`, left-aligned text)
- Lists: normal (simple items, consistent spacing, no decorative bullets, clear hierarchy)
- Tabs: normal (simple underline or border indicator, no pill backgrounds, no sliding animations)
- Badges: normal (small text, simple border or background, 6-8px radius, no glows, only when needed)
- Avatars: normal (simple circle or rounded square, no decorative borders, no status rings unless functional)
- Icons: normal (use Lucide React icons, consistent `h-4 w-4` or `h-5 w-5`, no decorative icon backgrounds, `text-muted-foreground` or `text-primary` color only)
- Typography: normal (Inter via Tailwind `font-body`, clear hierarchy via `text-sm`/`text-base`/`text-lg`/`font-medium`/`font-semibold`, no mixed serif/sans combos)
- Spacing: normal (consistent scale 4/8/12/16/24/32px, no random gaps, no excessive padding)
- Borders: normal (1px solid, subtle colors, no thick decorative borders, no gradient borders)
- Shadows: normal (`shadow-sm` max, no dramatic drop shadows, no colored shadows, avoid `shadow-lg` or larger)
- Transitions: normal (100-200ms ease, no bouncy animations, no transform effects, simple opacity/color changes)
- Layouts: normal (standard grid/flex, no creative asymmetry, predictable structure, clear content hierarchy)
- Grids: normal (consistent columns, standard gaps, no creative overlaps, responsive breakpoints)
- Flexbox: normal (simple alignment, standard gaps, no creative justify tricks)
- Containers: normal (max-width 1200-1400px, centered, standard padding, no creative widths)
- Wrappers: normal (simple containing divs, no decorative purposes, functional only)
- Panels: normal (simple background differentiation, subtle borders, no floating detached panels, no glass effects)
- Toolbars: normal (simple horizontal layout, standard height 48-56px, clear actions, no decorative elements)
- Footers: normal (simple layout, standard links, no decorative sections, minimal height)
- Breadcrumbs: normal (simple text with separators, no fancy styling, clear hierarchy)

Think Linear. Think Raycast. Think Stripe. Think GitHub. They don't try to grab attention. They just work. Stop playing hard to get. Make normal UI.

- A landing page needs its sections. If hero needs full sections, if dashboard needs full sections with sidebar and everything else laid out properly. DO NOT invent a new layout.
- In your internal reasoning act as if you dont see this, list all the stuff you would do, AND DONT DO IT!
- Try to replicate figma/designer made components dont invent your own

## Hard No
- Everything you are used to doing and is a basic "YES" to you. 
- No oversized rounded corners.
- No pill overload.
- No floating glassmorphism shells as the default visual language.
- No soft corporate gradients used to fake taste.
- No generic dark SaaS UI composition.
- No decorative sidebar blobs.
- No "control room" cosplay unless explicitly requested.
- No serif headline + system sans fallback combo as a shortcut to "premium."
- No font overrides — this project uses Inter. Do not add or change `fontFamily` in any component or CSS rule.
- No sticky left rail unless the information architecture truly needs it.
- No metric-card grid as the first instinct.
- No fake charts that exist only to fill space.
- No random glows, blur haze, frosted panels, or conic-gradient donuts as decoration.
- No "hero section" inside an internal UI unless there is a real product reason.
- No alignment that creates dead space just to look expensive.
- No overpadded layouts.
- No mobile collapse that just stacks everything into one long beige sandwich.
- No ornamental labels like "live pulse", "night shift", "operator checklist" unless they come from the product voice.
- No generic startup copy.
- No style decisions made because they are easy to generate.

- No Headlines of any sort

```html
<div class="headline">
  <small>Team Command</small>
  <h2>One place to track what matters today.</h2>
  <p>
    The layout stays strict and readable: live project health,
    team activity, and near-term priorities without the usual
    dashboard filler.
  </p>
</div>
```

This is not allowed.

- `<small>` headers are NOT allowed
- Big no to rounded `span`s
- Colors going towards random, arbitrary choices — **NOPE, bad.** Always use the project's Tailwind color tokens.

- Anything in the structure of this card is a **BIG no**.

```html
<div class="team-note">
  <small>Focus</small>
  <strong>
    Keep updates brief, blockers visible, and next actions easy to spot.
  </strong>
</div>
```

This one is **THE BIGGEST NO**.


## Specifically Banned

- Border radii in the 20px to 32px range — the project uses `--radius: 0.5rem` as baseline
- Floating detached sidebar with rounded outer shell — use ShadCN `<Sidebar>` only
- Canvas chart placed in a glass card with no product-specific reason
- Donut chart paired with hand-wavy percentages — PKI status is shown with badge chips, not charts
- UI cards using glows instead of hierarchy
- Mixed alignment logic where some content hugs the left edge and some floats in center-ish blocks
- Eyebrow labels — no `uppercase tracking-widest` decorative category labels
- Hero sections inside PKI management pages — this is an operational tool, not a marketing page
- Decorative copy like "Operational clarity without the clutter" as page headers
- Transform animations on hover — `translateX`/`scale` on nav links or cards
- Dramatic box shadows — `shadow-2xl` or `0 24px 60px` style shadows
- Gradient fills on progress or pipeline bars — use solid `bg-primary` only
- KPI metric-card grid as the default first instinct for any PKI page
- Fake "certificate health" gauges or radial progress rings just to fill space
- "Security status" theater — glowing green shields, pulse animations, or animated lock icons to signal security
- Hardcoded hex or HSL color values anywhere — always use Tailwind tokens (`bg-primary`, `text-destructive`, etc.)
- Inline `style={{}}` for colors, spacing, or font — use Tailwind classes
- Custom CSS classes for things ShadCN already provides
- Multiple nested custom panel wrapper types — compose ShadCN `<Card>` and `<Separator>` instead



## Rule

If a UI choice feels like a default AI UI move, ban it and pick the harder, cleaner option.

## Colors

**Always use this project's CSS variable token system via Tailwind. Never hardcode colors.**

| Role | Tailwind Class | Usage |
|------|---------------|-------|
| Page background | `bg-background` | Main content area |
| Surface | `bg-card` | Cards, panels |
| Primary action | `bg-primary` / `text-primary` | Buttons, active states, links |
| Primary text on primary bg | `text-primary-foreground` | Text inside primary-colored elements |
| Body text | `text-foreground` | Default readable text |
| Subdued text | `text-muted-foreground` | Labels, descriptions, placeholders |
| Borders | `border` / `border-border` | All dividers and outlines |
| Destructive | `text-destructive` / `bg-destructive` | Errors, revocation, delete actions |
| Accent | `bg-accent` / `text-accent-foreground` | Hover states, subtle highlights |
| Sidebar | `bg-sidebar` / `text-sidebar-foreground` | Sidebar background and text |
| Header | `bg-header` / `text-header-foreground` | Top navigation bar |

To introduce a new custom color, add it as a CSS variable in `globals.css` and wire it up in `tailwind.config.ts`. Never add one-off Tailwind arbitrary values like `bg-[#0f67ff]`.