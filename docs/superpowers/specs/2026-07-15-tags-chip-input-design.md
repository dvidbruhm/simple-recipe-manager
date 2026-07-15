# Tags Chip Input — Design Spec

**Date:** 2026-07-15
**Status:** Draft (pending user review)

Replace the comma-separated tags text field on the recipe edit page with a chip-based combobox input. Tags are added as chips; existing tags are offered as type-to-filter suggestions; brand-new tags can still be created by typing and pressing Enter.

---

## 1 · Goals & constraints

**Goals**
- A chips input where selected tags appear as removable chips instead of a comma-separated string.
- Type-to-filter suggestions drawn only from tags already present in the database.
- Allow creating a brand-new tag (not yet in the DB) by typing it and pressing Enter — so the first tag can be created even when the DB is empty.
- Match the app's dependency-light, vanilla-JS, Nunjucks + Tailwind v4 ethos (no new runtime UI dependency).

**Constraints**
- Stack: Hono + Bun, Nunjucks templates, htmx, Tailwind v4. No build step beyond Tailwind CLI.
- The only existing UI JS is `htmx.min.js`. The new component is framework-free vanilla JS served from `/static/`.
- Automated tests are HTTP-level via `app.request()` (no browser/DOM framework). Client-JS behavior is verified manually + through the HTTP contract, consistent with how existing htmx behavior is tested.

**Out of scope**
- Changes to the library sidebar filter chips (`partials/tag-chips.html`) — that is a different concern (filtering, not editing).
- A tag-management/admin screen. Tags are still created inline from the edit form.
- Client-side DOM unit tests (no jsdom/Playwright in the project).

---

## 2 · Interaction model

Decisions confirmed with the user:

- **Adding a chip**
  - Pressing **Enter** with no suggestion highlighted → adds the typed text as a chip (free-text creation).
  - Pressing **Enter** with a suggestion highlighted → adds that suggestion.
  - **Clicking** a suggestion → adds it.
  - **Comma is a literal character**, not a separator. It does not add a chip and is not used to split pasted text.
- **Removing a chip**
  - Click the chip's **×** button.
  - **Backspace** on an empty text input removes the last chip.
- **Duplicate prevention** — case-insensitive (matches the DB `NOCASE` collation). Adding `Dessert` when `dessert` is already a chip is ignored; the input is cleared.
- **Dropdown**
  - Opens on input, debounced ~150 ms. Suggestions are existing tags whose name starts with the typed prefix, minus any already selected.
  - Closes on selection, Esc, or blur.
  - **Blur** closes the dropdown and clears the typed text — it does not add an accidental chip from partial typing.
- **Keyboard navigation** — ArrowUp/ArrowDown move the highlight within the list; Enter selects the highlighted item; Esc closes and clears.
- **No tags in DB** → suggestions endpoint returns `[]` for any query → no dropdown shown. Free-text creation still works.

---

## 3 · Architecture & files

| File | Change |
|---|---|
| `src/ui/static/tags-input.js` | **New.** Framework-free controller (~150 lines) enhancing elements marked `data-tags-input`. Manages chips, dropdown, keyboard nav, ARIA, and hidden form fields. |
| `src/ui/templates/recipe-edit.html` | Replace the tags `<input>` block (`:51-54`) with a `data-tags-input` container rendering initial chips from the existing `tags` array, a text input, and a `<ul>` for suggestions. Load `/static/tags-input.js` once. |
| `src/tags/routes.ts` | Repurpose the existing but currently unwired `/tags/autocomplete` endpoint to return JSON (`string[]`) instead of `<li class="chip">` HTML. Removes dead code. |
| `src/recipes/routes.ts` | POST handler: switch from `tags.split(",")` to `form.getAll("tags")`. Edit route: drop `tags_text` (template renders chips directly from the `tags` array already passed). |
| `src/ui/css/app.tailwind.css` | Small additions: `.tags-input` container, selected chips reusing the existing `.chip` visual language + a remove button, and the `.tags-input__suggestions` dropdown. |
| `tests/http/theme-and-autocomplete.test.ts` | Update the 3 autocomplete assertions from HTML `<li>` to JSON. |
| `tests/http/recipe-view-edit.test.ts` | Update chip-rendering assertion (no more `dessert, italian` string); switch tag-submission tests from `fd.set("tags", "spicy, quick")` to `fd.append("tags", "spicy"); fd.append("tags", "quick")`. |

---

## 4 · Data flow

1. **Edit route** (`GET /recipes/:id/edit`) renders `tags: ["dessert", "italian"]` (already computed). The template renders one visible chip per name plus one hidden `<input type="hidden" name="tags" value="...">` per name.
2. **Component init** — on page load, `tags-input.js` finds `[data-tags-input]` containers, reads their initial chips/hidden fields, and wires up the text input + dropdown.
3. **Adding a chip** — the component appends a chip element and a hidden `name="tags"` input; removes the chip from the suggestion list if present; clears the text input.
4. **Removing a chip** — removes both the chip element and its hidden input.
5. **Submit** — FormData carries one `tags` field per chip: `tags=dessert&tags=italian`.
6. **POST handler** — `form.getAll("tags").map(s => s.trim()).filter(Boolean)` → `["dessert", "italian"]` → `tags.replaceForRecipe(id, list)`. Unchanged repository behavior.

---

## 5 · Suggestions endpoint

`GET /tags/autocomplete?q=<prefix>` → `application/json`, body `string[]`.

- Uses the existing `TagRepository.autocomplete(q)` (prefix `LIKE q%`, `ORDER BY name COLLATE NOCASE`, `LIMIT 10`).
- `q` missing or empty → `[]` (200).
- No matching tags / no tags at all → `[]`.
- HTML-unsafe characters are safe: `JSON.stringify` escapes as needed (`</script>` sequences are handled by JSON's own escaping).

Because suggestions come exclusively from the `tags` table, an empty DB yields `[]` for every query → no suggestions, satisfying the user's requirement. Free-text entry remains the path to create the first tag.

---

## 6 · Component contract (`tags-input.js`)

A single controller, instantiated per container:

```
new TagsInput(rootEl, { suggestionsUrl: "/tags/autocomplete" })
```

- On init, treats the server-rendered hidden `name="tags"` inputs as the canonical selected set and reconciles the visible chip elements to match (so first paint is correct before JS loads, and JS doesn't double-render).
- Maintains an in-memory set of selected tag names (case-insensitive lookup).
- `add(name)` — trim; ignore empty; ignore case-insensitive duplicates; append chip + hidden input; clear text input; close dropdown.
- `remove(name)` — remove chip + hidden input.
- `renderChips()` — reconcile visible chip elements with the set.
- `syncHidden()` — one hidden `<input name="tags" value="...">` per chip.
- `fetchSuggestions(q)` — `GET suggestionsUrl?q=<encoded>`, render filtered dropdown (excluding already-selected).
- Key handling: Enter, Backspace-on-empty, ArrowUp/ArrowDown, Esc.
- ARIA: input `role="combobox"`, `aria-expanded`, `aria-controls`; listbox `role="listbox"`; options `role="option"` + `aria-selected`.

---

## 7 · Styling

Reuse the existing `.chip` visual language (rounded-full, border, accent on hover) for selected chips, adding a small `×` remove button. New classes in `app.tailwind.css`:

- `.tags-input` — flex-wrap container, border, input that grows.
- `.tags-input__chip` — extends `.chip` with a remove button.
- `.tags-input__suggestions` — absolutely-positioned `<ul>` below the input, border, max-height with scroll, highlight on hover/active.

Uses existing CSS vars (`--color-border`, `--color-bg`, `--color-surface`, `--color-accent`, `--color-text`) so it adapts to light/dark/auto themes automatically.

---

## 8 · Testing

HTTP-level (bun:test, `app.request()`), following existing patterns:

- `GET /tags/autocomplete?q=des` → 200, JSON `["dessert"]` (prefix match; not `italian`).
- `GET /tags/autocomplete` (no q) → 200, `[]`.
- `GET /tags/autocomplete?q=<b` (HTML-unsafe) → 200, JSON containing the escaped name; no raw `<b>`.
- `GET /recipes/:id/edit` → chips rendered for the recipe's tags (assert chip markers for `dessert` and `italian`, not the old `dessert, italian` string).
- `POST /recipes/:id` with `tags` repeated → persists correctly; view reflects new tags, old ones gone.
- `POST /recipes/:id` with a single empty `tags` → clears tags (`getAll` → `[""]` → trim/filter → `[]`).

The vanilla-JS component's DOM/keyboard behavior is verified manually (no DOM test runner in the project).

---

## 9 · Out of scope & notes

- Comma-paste splitting (pasting `a, b, c` to make 3 chips) is intentionally NOT supported — comma is a literal character per the agreed interaction model.
- The old `/tags/autocomplete` HTML contract is replaced (not kept alongside a second endpoint) to avoid a dead duplicate endpoint. Its 3 tests are updated, not deleted.
- No new runtime dependency is introduced.
