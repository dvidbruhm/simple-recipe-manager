# Recipe Manager — UI Showcase Mockup Brief (shared by all 10 mockups)

You are building **one** self-contained HTML mockup file: a "style showcase / UI kit" page for a self-hosted **Recipe Manager** web app. The whole point is to show **one specific visual style applied consistently to every kind of UI element the app contains**, so the app's owner can decide whether they like the direction.

## Global constraints (read carefully)

- **Output:** exactly one file at the path given in your task. Self-contained: all CSS inline in a single `<style>` block. No external `.css`/`.js` files. No build step.
- **Dark mode only.** Every style direction below is interpreted for a DARK interface. Design tokens must be dark-appropriate (dark backgrounds, light text), even for the "minimalist" and "magazine" directions.
- **Fonts:** Google Fonts via `<link href="https://fonts.googleapis.com/...">` is allowed and encouraged where the direction specifies a typeface.
- **Images:** use the exact Unsplash URLs listed in "Sample content". They are already sized (`?w=600`). Do not invent other image URLs. For the recipe with no image, render a styled "no image" placeholder block instead of an `<img>`.
- **No real interactivity required.** Show dropdowns/menus in their **open** state with pure HTML/CSS (don't rely on `:hover` to reveal key elements — the reviewer is taking screenshots). A tiny sprinkle of CSS-only flourish is fine. Do not add `<script>` tags; not needed.
- **Structure the page as a labeled showcase.** Each of the 14 sections below must have a visible `<h2>` section label (e.g. "01 · Header", "02 · Buttons", …) so the page reads as an intentional style tile / UI catalog, not a real running app. A short one-line note under each label is fine.
- **Page width:** wrap content in a `max-width` of roughly 1120–1200px, centered. Desktop-first; it doesn't need to be perfectly responsive, but don't horizontally overflow wildly.
- **Quality bar:** this file exists to be judged aesthetically. Commit HARD to the style. Make it genuinely beautiful, cohesive, and distinctive. Weak/timid execution that looks like "generic dark theme" is a failure — the owner specifically finds generic/plain UI boring.
- **Accessibility basics:** use real `<label>`s for form fields, semantic headings, `alt` text on images, `aria-hidden` on decorative glyphs. Keep it simple but correct.
- **Do not** include any header/footer linking to other mockups, navigation tabs, or "select theme" switchers. One isolated style per file.

## Page preamble (top of every mockup)

Start the `<body>` with a **style intro** block containing:
- The style **name** (big) and a **one-line concept** sentence.
- A **palette row**: small swatches with hex labels (every color token used).
- A **type scale specimen**: the display font + body font names and a sample line each.

Then render the 14 sections in order.

---

## The 14 sections (ALL must appear, in this order)

### 01 · Header bar
A top app bar containing: a **logo** (wordmark or mark — style it on-theme), a **search field** (placeholder "Search recipes, ingredients, steps…"), an **"+ Add recipe"** control shown as an **open dropdown** revealing two items ("New recipe", "Import from URL"), a **sort** control shown as an **open dropdown** (items: Name A→Z, Name Z→A, Date New→Old, Date Old→New, Stars 0→5, Stars 5→0; mark "Date added (New → Old)" as the active/checked one), a **card/list view toggle** (two icons), a **theme toggle** button (☾ glyph), and a **settings gear** icon button.

### 02 · Buttons
Show the full button family, labeled:
- **Primary** ("Save"), **Default** ("Edit"), **Danger** ("Delete"), a **Ghost/Icon** button (gear), a **small ± step button** pair (− and +) as used for servings, a **favorite** button in both states (♡ unfilled and ♥ filled/active), and a **text/link button** ("Original ↗"). Show default + one hover/focus styling note.

### 03 · Form controls
A small form sample with real labels:
- Text input (label "Title"), a search input, **Email** + **Password** pair, a multi-line **textarea** (label "Description"), a **number** input (label "Servings", value 4), a **select** (label "Rating", options 0–5 stars, "4 stars" selected), a **file** input (label "Image"), and a **checkbox** pair (one checked = a bought ingredient, one unchecked).

### 04 · Tags chips input (editor)
The tag editor widget: a wrapped row of removable chips "dessert ×", "italian ×", "chocolate ×", an active text input with the partial text "qui", and a suggestions dropdown listing "quick", "quiche", "quininoa".

### 05 · Filter chips
Two groups. **Tags:** `all` (active), `dessert`, `italian`, `quick`, `vegetarian`, `soup`, `chocolate`, `french`, `dinner`, `baking`. **Source:** `marmiton`, `750g`, `allrecipes`, `bbc good food`. Style active vs inactive distinctly.

### 06 · Recipe grid (cards)
A responsive grid of **6 cards**. Each card: image, title, source domain, a star rating (mix of values), and 1–3 tag chips. Include the **"Grandma's Apple Tart" card with NO image** (styled placeholder) as the 6th. Make **one card appear selected** (e.g. "Molten Chocolate Lava Cake") with a visible selection check/checkbox corner and a selected-state ring/tint, to show the bulk-select affordance.

### 07 · Recipe list (rows)
The compact **list view**: 3 dense rows. Each row: a small thumbnail (or placeholder glyph for the tart), title, source, rating, tags inline, and a trailing select-checkbox.

### 08 · Recipe cook view
A full single-recipe view for **"Classic Tiramisu"**: a back link ("← Recipes"), a header (image + title + an **interactive 5-star rating showing 4 filled** + a description paragraph + tag chips), then a two-column body:
- **Ingredients** column: a "Servings" scaler (label "Servings", a − button, a number input showing 4, a + button, a "Reset" button) and a checklist of 6 ingredients (3 of them checked/struck-through).
- **Steps** column: a **cook-mode progress** bar ("Step 2 of 6" with Prev/Next buttons), then an ordered list of 6 steps with step 2 visually highlighted as current.
Then a **Notes** block (a short paragraph), then a footer with: "Original ↗" link, **Edit**, **Delete** (danger), **Print**, **Favorite** ♥.

### 09 · Edit form excerpt
A condensed recipe edit form (not the whole thing): Title input, Description textarea, Rating select, the Tags chips input (reuse styling from §04), Image upload with the hint "or paste an image here (Ctrl+V)", Source URL input, and a Save (primary) + Cancel row.

### 10 · Settings cards
Four stacked cards: **Export** (buttons: JSON, Markdown zip, PDF, JSON-LD zip), **Import** (file input + a "Preview import" primary button + a tiny hint "Max 50 MB…"), **About** (logo + "Recipe Manager" + "Version 2.3.0" + a "GitHub ↗" link), **Sign out** (a danger "Log out" button).

### 11 · Auth form
A centered **Sign in** card: title "Sign in", an error note ("Invalid email or password."), Email field, Password field, "Sign in" primary button, and two links "Forgot your password?" / "Create an account".

### 12 · Feedback components
A cluster showing: a **toast** notification with a message ("Recipe imported"), an action button ("View"), and a × close; a **bulk-action bar** pinned-looking strip ("3 selected · Delete · Cancel"); a **skeleton loader** card (shimmering placeholder blocks); a small **spinner**; an **empty state** ("No recipes yet — import your first" + a primary "Import from URL"); and an **error / draft banner** ("We couldn't extract a recipe from that page…").

### 13 · Star rating + micro-interactions
Show the star-rating component alone in states: 0, 2, 4, 5 stars filled (large). Add one sentence noting any signature micro-interaction (hover glow, fill animation, etc.) your style would use.

### 14 · Footer / token reference
A small footer restating the app name, and a compact "design tokens" mini-table listing the key CSS custom properties (background, surface, text, muted, accent, border, radius) so the design language is explicit and reusable.

---

## Sample content (use EXACTLY these — for cross-mockup comparability)

### Recipes (use for §06 grid, §07 list, §08 cook view uses Tiramisu)
| # | Title | Source | Rating | Tags | Image |
|---|---|---|---|---|---|
| 1 | Classic Tiramisu | marmiton.org | 5 | dessert, italian | `https://images.unsplash.com/photo-1571877227200-a0d98ea605ae?w=600` |
| 2 | Spaghetti Bolognese | bbcgoodfood.com | 4 | italian, dinner | `https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600` |
| 3 | Spinach and Feta Turkey Burgers | allrecipes.com | 3 | dinner, quick | `https://images.unsplash.com/photo-1528908510736-5258199bc7dd?w=600` |
| 4 | Molten Chocolate Lava Cake | allrecipes.com | 5 | dessert, chocolate, baking | `https://images.unsplash.com/photo-1547592180-85f173990554?w=600` (this one is the "selected" card in §06) |
| 5 | Soupe à l'Oignon | 750g.com | 4 | soup, french | `https://images.unsplash.com/photo-1547592166-23ac45744ffd?w=600` |
| 6 | Grandma's Apple Tart | manual | 5 | dessert, baking | NO IMAGE — styled placeholder |

(For §07 list rows, reuse rows 1, 4, and 6. For other grids if you need more variety you may also use: Ratatouille Provençale / marmiton.org / 5 / french, vegetarian / `photo-1565958011703-44f9829ba187`; Pasta al Pomodoro / bbcgoodfood.com / 0 / italian, vegetarian, quick / `photo-1473093295043-cdd2671d276a`. Always `https://images.unsplash.com/photo-<id>?w=600`.)

### Tiramisu detail (for §08 cook view)
- **Description:** "A classic Italian dessert of espresso-soaked ladyfingers layered with mascarpone cream and dusted with cocoa."
- **Tags:** dessert, italian, no-bake
- **Ingredients (6):** "6 egg yolks", "¾ cup white sugar" (checked), "1⅔ cups heavy cream" (checked), "1 package (around 30) ladyfingers", "1¾ cups strong brewed espresso, cooled" (checked), "2 tbsp unsweetened cocoa powder"
- **Steps (6):** 1) Whisk egg yolks and sugar until thick and pale. 2) Fold in mascarpone until smooth. 3) Whip cream to soft peaks and fold in. *(step 2 is the current/highlighted step)* 4) Combine espresso and a splash of liqueur in a shallow dish. 5) Dip each ladyfinger briefly and layer in a dish. 6) Spread cream, dust with cocoa, chill 4+ hours.
- **Notes:** "Best made a day ahead. Don't oversoak the ladyfingers or the layers turn to paste."
- **Servings:** 4 (scaler shows 4)
- **Source:** marmiton.org

### Tags & sources
- Tags: all, dessert, italian, quick, vegetarian, soup, chocolate, french, dinner, baking
- Sources: marmiton, 750g, allrecipes, bbc good food

---

## Done criteria
- All 14 sections present, in order, each with a visible label.
- Every sample content item above used in the right place.
- Single self-contained HTML file, dark mode, on-theme throughout.
- Visually distinctive and committed — not a generic dark theme.

## What to return when finished
Reply with: the absolute file path you wrote, plus a 2–3 sentence summary of the style and any notable choices or assumptions you made.
