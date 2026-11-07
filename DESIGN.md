---
name: Sree Krishna Motors – Rental Management
description: Ink-black rail, cool paper-white working page, one "Krishna blue" accent for what you can act on.
colors:
  ink-rail: "oklch(0.18 0.018 262)"
  ink-rail-accent: "oklch(0.27 0.035 262)"
  rail-text: "oklch(0.83 0.012 262)"
  rail-muted: "oklch(0.68 0.015 262)"
  primary: "oklch(0.5 0.2 262)"
  rail-primary: "oklch(0.55 0.2 262)"
  paper: "oklch(0.975 0.004 260)"
  card: "oklch(1 0 0)"
  ink: "oklch(0.2 0.02 262)"
  muted-text: "oklch(0.48 0.02 262)"
  muted-surface: "oklch(0.96 0.006 262)"
  accent-surface: "oklch(0.95 0.025 262)"
  border: "oklch(0.91 0.008 262)"
  input-border: "oklch(0.87 0.01 262)"
  paid-green: "oklch(0.5 0.13 152)"
  owed-red: "oklch(0.54 0.21 27)"
  attention-amber: "oklch(0.56 0.13 62)"
  violet: "oklch(0.5 0.2 293)"
typography:
  page-title:
    fontFamily: "Inter, Noto Sans Malayalam, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  stat-value:
    fontFamily: "Inter, Noto Sans Malayalam, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Inter, Noto Sans Malayalam, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.375
  body:
    fontFamily: "Inter, Noto Sans Malayalam, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  column-label:
    fontFamily: "Inter, Noto Sans Malayalam, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.025em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  page-x-mobile: "16px"
  page-x: "32px"
  card: "20px"
  gap: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 16px"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "40px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "40px"
    padding: "0 12px"
  nav-item-active:
    backgroundColor: "{colors.rail-primary}"
    textColor: "{colors.card}"
    rounded: "{rounded.lg}"
    height: "44px"
  nav-item:
    backgroundColor: "{colors.ink-rail}"
    textColor: "{colors.rail-text}"
    rounded: "{rounded.lg}"
    height: "44px"
  slip-no:
    backgroundColor: "{colors.accent-surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "{spacing.card}"
---

# Design System: Sree Krishna Motors – Rental Management

## Overview

The shop's paper rental register, made calm and legible for a busy counter. An **ink-black rail** holds the business name and the navigation; the working page is **cool paper-white** with white cards. **Blue marks only what you can act on or what is selected**: primary buttons, the current page, active filters, links, focus. Green, red and amber appear only when they mean something (paid / owed / needs attention).

Main device is the shop PC; phones are for quick checks. Every screen works in English and Malayalam, so text wraps rather than truncates and lines get extra height in Malayalam.

## Colors

### Primary
- **Krishna blue** `primary` – the one accent: primary button, active filter tab, links, focus ring, slip numbers, brand mark. One blue action per screen.

### Neutral
- **Ink rail** `ink-rail` with `ink-rail-accent` for hover and the user avatar; rail text `rail-text`, secondary `rail-muted`.
- **Paper** `paper` page ground, **card** white, **ink** `ink` text, `muted-text` for secondary text, `border` hairlines.

### Semantic
- `paid-green` – paid, available, active, success notices.
- `owed-red` – amounts owed, refunds, out too long, errors.
- `attention-amber` – under repair, warnings.
- `violet` – a fourth chart/status hue, used sparingly (part returned, rentals tile).

### Named Rules
- **The One Blue Rule.** Blue is spent only on action, selection and document numbers. Never decorate with it.
- **Meaning, Not Mood.** Green/red/amber appear only on values or states they describe, always paired with an icon or a word.

## Typography

One family: Inter for Latin, Noto Sans Malayalam for Malayalam, self-hosted. Root size 15px. Tabular numerals for every amount, count and date.

### Hierarchy
- Page title 1.375rem/600 in the top bar; card titles 1rem/500; body 0.875rem; stat values 1.75rem/600 tabular.
- Table column labels 0.75rem/600, uppercase (no effect in Malayalam), muted.

### Named Rules
- **Malayalam Room.** `html:lang(ml)` line-height 1.65; never truncate a Malayalam label that can wrap.

## Layout

- Desktop: 256px rail + content. Content padding 32px (16px on phones). Every page starts with the **top bar** (`PageHeader`): full-bleed, sticky on desktop, title + optional subtitle + optional small back link on the left, actions on the right.
- List and dashboard pages use the full content width, so cards, tables and the top bar share one right edge. Forms cap at `max-w-3xl`; the invoice view at `max-w-4xl`.
- Summary tiles: 4 across on wide screens, 2×2 compact on phones.
- A list is one **work card**: toolbar (search left, filter tabs right), table edge to edge, pagination footer.
- Phones: black top bar with brand and language switch, white bottom bar with five items (active in blue).

## Elevation & Depth

Flat paper with soft, offset shadows only:
- Card: `0 1px 2px ink/5%, 0 4px 12px -4px ink/6%` plus a 1px ink/8% ring.
- Primary button: `0 1px 2px blue-shadow/30%`. Primary quick-action tile: `0 2px 8px -2px blue/50%`.
- Hover lift on linked tiles: translate −1px and `shadow-md`, 200ms.
- Top bar: `bg-card/95` with a small backdrop blur so content scrolls under it legibly.

## Shapes

Radius base 10px: inputs/buttons `lg` (10px), cards `xl` (14px), slip chips `sm` (6px), pills and avatars fully round. Icon tiles inside cards are rounded-xl squares, not circles.

## Components

### Buttons
Primary (blue, white text), outline (white with border), destructive (red tint), ghost. Heights: default 36px, `lg` 40px (page actions and forms), `sm` 32px. Primary actions always carry an icon and a word.

### Chips
- **Pill** (`stat-tile.tsx`) – status label, tinted background + inset ring + optional icon (`OrderStatusBadge`, customer/user status).
- **SlipNo** (`slip-no.tsx`) – the signature: document numbers (ORD/INV/RCP/RFD) as blue outlined chips in tabular figures, struck through when voided.

### Cards / Containers
- **StatTile** – icon square in the tone colour, label, big value, detail line; `compact` stacks on phones.
- **QuickActions** – the counter's daily jobs as large labelled link tiles; "New order" is the single blue tile.
- **Notice** – inline banner `<p>` with icon: success, info, warning, error.
- **EmptyState** – icon in a blue-tinted square, one-line title, optional hint and button.

### Inputs / Fields
40px, white, 1px `input-border`, blue focus ring; labels above, errors in red with an icon. Search inputs carry a leading magnifier.

### Navigation
Ink rail: brand mark (initials on blue), 44px nav items with icon + label, active item solid blue with white text, user card + language switch + log out at the foot. List filters use **FilterTabs** (segmented, active tab white with blue label).

## Do's and Don'ts

### Do:
- Start every page with `PageHeader`; put the single primary action top-right.
- Build lists as a work card (`ListToolbar`, `SearchForm`, `FilterTabs`, table, `ListPagination`).
- Show document numbers with `SlipNo`, statuses with `Pill` + icon, money with `formatINR` in tabular figures.
- Add every string to both `en.json` and `ml.json` and check the Malayalam render.

### Don't:
- Don't add per-page `max-w-*` wrappers on list or dashboard pages; it breaks the shared right edge.
- Don't use blue for decoration, or a second blue button on the same screen.
- Don't signal state by colour alone.
- Don't put links or controls above the top bar; use its `back` prop instead.
