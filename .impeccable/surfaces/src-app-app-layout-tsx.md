---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/components/page-header.tsx","src/app/(app)/app-nav.tsx"]
---

# App shell (all signed-in screens)

Scope: the signed-in app shell and shared components (sidebar, top bar, cards, tables, filters, notices, empty states, forms) plus the sign-in screens. Print slips are out of scope.
Mode: Operate. Main device: shop PC at the counter; phones for quick checks. English + Malayalam.
Job: finish a counter transaction quickly (issue, return, payment), and let the owner read stock and money at a glance.

## Direction contract

THESIS: The shop's paper rental register made calm and legible: an ink-black rail beside a white working page, where blue marks only what you can act on or what is selected. Refuses the grey-on-grey admin template whose cards and header never line up.

OWN-WORLD: Ink-black rail with a faint blue cast; "Krishna blue" for primary actions, selection, links and focus; cool paper-white ground; white cards with a soft offset shadow; green = paid/available, red = owed/overdue, amber = repair/warning. Inter + Noto Sans Malayalam, tabular numerals for all money and counts.

STORY: Staff always know which page they are on, find the one blue action top-right, and read amounts and statuses without hunting. Statuses carry an icon and a word, never colour alone.

FIRST VIEWPORT: Black rail left (SK mark + business name, nav, user card with language and log out). A sticky white top bar holds the page title, subtitle and the blue primary action. Below, one shared container: the summary row, then a work card (toolbar, then table), with every right edge aligned to the top bar.

FORM: Pinned by the owner's brief (black sidebar, light pages, single blue accent). seed: none (unavailable)
Signature move: document numbers (order, invoice and receipt numbers) set as blue "slip number" chips in tabular figures, like the stamped number on a paper slip, wherever they appear.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
