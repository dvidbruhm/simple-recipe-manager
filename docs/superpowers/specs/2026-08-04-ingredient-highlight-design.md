# Ingredient–Step Highlight — Design Spec

**Date:** 2026-08-04
**Status:** Draft (pending user review)

On the recipe view page, highlight every ingredient word that is mentioned somewhere in the steps. Example: an ingredient line "200 g cooked rice (about 1 cup)" gets `rice` bolded and tinted because a step mentions it. The goal is visual scanning aid (mise en place), not linguistic precision.

---

## 1 · Goals & constraints

**Goals**
- Word-level highlighting inside ingredient lines: only the matched food word(s) are wrapped, not the whole line.
- A word is highlighted if it appears in ANY step (static, computed once at render — not relative to cook-mode progress).
- Everything counts, including staples (salt, pepper, oil, water). No pantry stoplist.
- Highlight style: bold + a highlight color derived from theme tokens, so it fits all 7 themes and both modes.

**Constraints**
- Stack: Hono + Bun, Nunjucks SSR, no build step for static JS, no new runtime dependency.
- `servings.js` rewrites ingredient span text via `textContent` when scaling (`data-original` is the source of truth). Any markup inside the span is wiped on every scale and must be re-applied.
- Ingredient data is bilingual (English and French), including elisions (`l'oignon`, `d'huile`) and accented words. Matching must be Unicode-aware.
- Matching logic lives in testable TS under `src/` (repo convention: logic in `src/`, DOM glue in `src/ui/static/`), covered by `bun test`.

**Out of scope**
- Highlighting mentions inside the step text (only ingredient lines are marked).
- Per-step / cook-mode-aware highlighting (highlight set changing with the active step).
- Skipping pantry staples (explicitly decided against).
- Translation or cross-language matching (`pomme de terre` does not match "potatoes").
- Structured ingredient parsing (quantity/unit/food fields) or NLP dependencies.

---

## 2 · Decisions confirmed with the user

- **Granularity:** highlight the ingredient *words* that appear in the steps (word-level `<mark>` inside the line).
- **Scope:** a word counts if it appears in any step (static union of all steps).
- **Staples:** highlight everything, including salt/pepper/oil/water.
- **Approach:** Option A — server-side matching, server-rendered marks, with a client re-mark after servings scaling.

---

## 3 · Matching module

New file `src/recipes/ingredient-highlight.ts`, pure TS, no deps.

```ts
export interface IngredientView {
  original: string;                       // unchanged line, for data-original
  segments: { text: string; hit: boolean }[]; // runs for template rendering
  hits: string[];                         // unique hit word forms, for data-hl
}

export function highlightIngredients(
  ingredients: string[],
  steps: string[],
): IngredientView[];
```

**Algorithm**

1. **Step corpus:** join all steps; NFKC-normalize; lowercase; tokenize on non-letters (Unicode `\p{L}`), so `l'oignon` → `l`, `oignon`, accents preserved. `l` is later dropped by the min-length rule.
2. **Per ingredient line:**
   - Empty lines and pure section-header lines (`/^\s*\[.*\]\s*$/`, e.g. `[Tomato gravy]`) produce a view with a single non-hit segment and no hits.
   - Strip parentheticals `(...)` and leading bullet markers (`•`, `-`, `*`) before tokenizing.
   - Strip compound unit phrases before tokenizing: `c. à soupe`, `c. à thé`, `c. à table` (so `soupe`/`thé` are not consumed as words).
   - Tokenize as in step 1; drop tokens shorter than 3 chars; drop tokens on the stoplist (§4).
3. **Match:** a remaining token is a hit if any corpus token matches via `sameWord(a, b)`:
   - NFKC-normalize + lowercase both.
   - Strip one trailing `s` from each (unless the word ends in `ss`).
   - Match if equal, or if one equals the other plus a trailing `e`.
   - Handles: egg/eggs, tomato/tomatoes, olive/olives, potato/potatoes, fig/figs, pomme/pommes, échalote/échalotes. Boundary-safe by construction: matching compares whole tokens only, so `pea` never matches `peanut`.
4. **Output:** segments are built from token positions in the original line (runs of hit/non-hit tokens plus the untouched text between tokens), so the template wraps exact occurrences without re-searching. `hits` lists the hit word forms as they appear in the line, deduplicated.

The heuristic is intentionally approximate: a missed highlight is acceptable; false positives (non-food words highlighted) are the failure mode to minimize via the stoplist.

---

## 4 · Stoplist

One bilingual list in three categories (v1 contents; extendable, covered by tests):

- **Units:** g, kg, ml, cl, dl, l, oz, lb, lbs, cup, cups, tasse, tasses, tbsp, tsp, tablespoon, teaspoon, pint, quart, pinch, pincée, dash, can, tin, boîte, packet, stick, head, clove, cloves, gousse, gousses, sprig, sprigs, branche, thumb, piece, slice, slices, tranche, tranches, liter, litre, liters, litres.
- **Function words:** of, the, a, an, and, or, to, into, for, with, about, approx, approximately, environ, plus, more, less, as, needed, required, optional, facultatif, divided, separated, taste, goût, room, temperature, ambiante, very, some, few, each, all, tout, toute, enough, suffisante, quantity, de, du, le, la, les, un, une, des, au, aux, en, par, sur, dans, et, ou, pour, avec, sans, desired, désiré.
- **Prep words:** chopped, finely, minced, diced, sliced, crushed, grated, shredded, peeled, smashed, rinsed, drained, cooked, softened, melted, toasted, roasted, frozen, thawed, fresh, dried, ground, kosher, coarse, fine, roughly, thinly, thickly, cut, halved, quartered, juiced, zested, washed, stemmed, seeded, picked, torn, broken, whole, haché, hachée, hachées, coupé, coupée, coupés, coupées, émincé, émincée, émincés, râpé, râpée, pressé, pressée, pelé, pelée, pelés, cuit, cuite, cuits, cuites, rincé, rincés, rincée, égoutté, égouttés, égouttée, fondu, fondue, ramolli, ramollie, tempéré, tempérés, frais, fraîche, surgelé, surgelés, surgelées, séché, séchées, moulu, moulue, entier, entière, gros, grosse, petit, petite, moyen, moyenne, doux, douce, grillé, grillée, lavé, lavée, équeuté, épépiné, concassé, concassées, taillé, taillée, dés, julienne, biseau, quartiers, morceaux.

Words like `black` (in "black pepper") are deliberately NOT filtered: the companion word still matches, and filtering risks losing real foods.

---

## 5 · Rendering

| File | Change |
|---|---|
| `src/recipes/routes.ts` | `GET /recipes/:id` calls `highlightIngredients(recipe.ingredients, recipe.steps)` and passes the views as `ingredients` to the template (replacing the raw array currently consumed there). |
| `src/ui/templates/recipe-view.html` | Ingredient loop renders segments; span keeps `data-original` and gains `data-hl`. |

Template ingredient span:

```html
<span data-original="{{ ing.original }}" data-hl="{{ ing.hits | join(',') }}">
  {%- for seg in ing.segments -%}
    {%- if seg.hit -%}<mark class="ing-hit">{{ seg.text | fractions }}</mark>
    {%- else -%}{{ seg.text | fractions }}{%- endif -%}
  {%- endfor -%}
</span>
```

`data-original` is unchanged, so checkbox behavior and servings scaling keep working. The `fractions` filter applies per segment (it only rewrites decimals, never letters, so segment boundaries are unaffected).

---

## 6 · Servings re-marking

`servings.js` `apply()` sets `span.textContent` for every ingredient span, wiping marks. Change: after every text rewrite (including the invalid/empty-input branch that restores the original text), call a small `remark(span)` helper:

- Read `data-hl`; split on `,`; skip empties.
- For each word: regex-escape it and wrap exact occurrences using non-letter boundary checks (`(^|[^\p{L}])word(?![\p{L}])`, `u` flag).
- Scaling only changes leading quantities, so the original word forms are still present — no stemming needed client-side.
- Result equals the server render for the same text, so restoring the original servings value reproduces the initial highlights.

No change to `cook-mode.js` (step text is never marked).

---

## 7 · Styling

Base rule in `src/ui/css/app.tailwind.css` using theme tokens (works across all themes/modes since tokens vary per theme):

```css
.ing-hit {
  font-weight: 700;
  background: color-mix(in srgb, var(--color-star) 40%, transparent);
  border-radius: 3px;
  padding: 0 0.15em;
  box-decoration-break: clone;
}
@media print {
  .ing-hit { print-color-adjust: exact; }
}
```

Per-theme overrides in `src/ui/css/themes/*.css` only if a specific theme needs tuning later — none ship with v1.

---

## 8 · Testing

- **Unit tests** (`tests/unit/recipes/ingredient-highlight.test.ts`):
  - English plurals (egg/eggs, tomato/tomatoes), French plurals (pomme/pommes, échalote/échalotes), trailing-e forms (olive/olives).
  - Elision: step `l'oignon` matches ingredient `1 oignon, diced`.
  - Quantities/units stripped: `200 g cooked rice` → `rice` can hit; `g`, `200` never do.
  - Parentheticals stripped: `(about 1 cup)` contributes no tokens.
  - `[Section header]` lines produce no hits.
  - Prep words filtered: `chopped` in `1 onion, chopped` is not a hit even when a step says "chopped onion" (onion still is).
  - Boundary safety: ingredient `pea` does not match step `peanut`.
  - Staples match: `salt` ingredient + step "season with salt" → hit.
  - Empty steps or empty ingredients → no hits, segments still cover the full original text (concatenated segments === original line).
- **HTTP test** (extend existing recipe-view coverage in `tests/http/`): `GET /recipes/:id` renders `<mark class="ing-hit">` around the expected word and `data-hl` on the span.

---

## 9 · Risks & mitigations

- **Stoplist gaps** (non-food word highlighted): acceptable per goals; list is in one place and test-backed, easy to extend.
- **False negatives from crude stemming** (e.g. irregular plurals, "leaves"/"leaf"): accepted; visual aid only.
- **Markup vs. textContent interplay**: `data-original` remains the single source of truth; `remark()` is the only place marks are rebuilt client-side.
- **Performance**: text sizes are tiny (one recipe); matching runs once per view render. No measurable cost.
