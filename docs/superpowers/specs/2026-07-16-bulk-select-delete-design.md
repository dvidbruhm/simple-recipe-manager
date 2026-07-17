# Bulk Select & Delete Recipes — Design Spec

**Date:** 2026-07-16
**Status:** Draft (pending user review)

Add multi-select to the recipe library so several recipes can be deleted at once. Selection is entered without any permanent UI chrome — via long-press (mobile) or a hover-revealed check (desktop) — and a sticky bottom action bar exposes bulk actions. The first bulk action is delete; the architecture leaves room for more.

---

## 1 · Goals & constraints

**Goals**
- Select multiple recipes from the library (both card grid and list views) and delete them in one action.
- Unobtrusive at rest: no always-visible checkboxes, no toolbar button. Entry is via long-press (touch) or a hover-revealed check (pointer).
- Slick, no-reload delete: selected cards animate out (reusing the existing `gridFade`), a toast confirms the count, and a single **Undo** restores all of them.
- Selection is sticky across search/filter/sort: filtering does not discard selections already made.

**Constraints**
- Stack: Hono + Bun, Nunjucks SSR, htmx, Tailwind v4, SQLite. No new runtime dependency.
- The library grid (`#grid`) is re-rendered by htmx on every search keystroke, tag toggle, and sort change. Client-side selection state must survive those swaps.
- Existing precedent for client JS is a single framework-free controller served from `/static/` (`tags-input.js`). This feature follows the same pattern.
- Automated tests are HTTP-level via `app.request()` plus unit tests on the repository. Client-JS behavior is verified manually + through the HTTP contract, consistent with existing htmx features.

**Out of scope**
- Bulk actions other than delete (e.g. bulk tag/favorite/export). The action bar is built so these can slot in later, but only Delete ships now.
- A "trash" / deleted-items screen. Soft-delete semantics are unchanged; restore happens only via the Undo toast.
- Persisting selection across a full page load or view toggle (cards↔list). Selection is in-memory per page load and resets on navigation.
- Client-side DOM unit tests (no jsdom/Playwright in the project).

---

## 2 · Interaction model

Decisions confirmed with the user:

- **Entering selection mode** (two paths, both unobtrusive):
  - **Long-press** a card/row (~500 ms). Cancels on scroll or pointer move beyond a small threshold so it never blocks browsing. On fire: enters mode and pre-selects that recipe. Suppresses the browser context menu and the card's `<a>` navigation.
  - **Hover-revealed check** (pointer devices only). A small circular check appears at the card's top-left on hover; clicking it enters mode and pre-selects that recipe.
- **In selection mode:**
  - Checks are visible on every card/row regardless of hover. The favorite heart stays top-right (no conflict).
  - Clicking a card/row or its check toggles that recipe in the selection. The card's normal `<a>` navigation is suppressed while mode is active.
  - The favorite heart keeps working (events scoped so it does not toggle selection).
- **Action bar (sticky bottom):** shows `N selected`, **Select all** (all currently visible), **Clear** (empty selection), **Delete** (disabled when N = 0), **Cancel**.
- **Exiting selection mode:** **Cancel**, or **Esc**. (Deselecting the last item does not auto-exit — explicit exit avoids losing an in-progress selection.)
- **Delete flow:** clicking **Delete** removes the selected recipes via htmx; the grid swaps to the refreshed set (deleted gone, `gridFade` animates the change); a toast `Deleted N recipes` appears with **Undo**. No confirm dialog — every delete is reversible via soft-delete.
- **Undo:** one click restores all N recipes at once (grid swaps back, toast clears).
- **Sticky selection across filters:** because selection is an in-memory `Set` of ids reapplied after each grid swap, a user can filter to "dessert", select 3, switch to "italian", select 2, then delete all 5. The count reflects the whole set; deleting affects every selected id, including any hidden behind an active filter (this is the intended behavior of sticky selection).

---

## 3 · Architecture & files

| File | Change |
|---|---|
| `src/recipes/repository.ts` | Add `softDeleteMany(ids: number[])` and `restoreMany(ids: number[])`. |
| `src/recipes/routes.ts` | Add `POST /recipes/bulk-delete` and `POST /recipes/bulk-restore` (hx-aware). Single restore route is unchanged (still `POST /recipes/:id/restore`); its reachability is fixed on the template side (§6). |
| `src/ui/templates/library.html` | Add `data-bulk-select` to the library root; add a `#toast-area` OOB target; render the toast via the new partial; load `/static/bulk-select.js`; include the new action-bar partial. Remove the inline toast block (moved to the partial). |
| `src/ui/templates/partials/recipe-card.html` | Add `data-recipe-id="{{ r.id }}"` to `.card-wrap` and a `.check` toggle element (hidden by default). |
| `src/ui/templates/partials/recipe-list.html` | Same changes as the card partial. |
| `src/ui/templates/partials/bulk-actionbar.html` | **New.** Sticky bottom bar: count, Select all, Clear, Delete, Cancel. Delete is a submit button tied to a hidden htmx form (§7). |
| `src/ui/templates/partials/toast.html` | **New.** Renders the toast message, an optional POST-form **Undo** (`undo_url` + `undo_ids[]`), a close button, and self-dismiss. Replaces the inline block in `library.html` and is reused for the bulk OOB toast. |
| `src/ui/static/bulk-select.js` | **New.** Framework-free controller: selection `Set`, mode entry (long-press + hover-check), toggle/Select all/Clear, count + disabled-Delete, hidden-ids sync, Esc/Cancel exit, `htmx:afterSwap` re-apply + re-bind, toast dismiss wiring. |
| `src/ui/css/app.tailwind.css` | `.check` (hidden by default; revealed on `:hover` and under `.is-selecting`), `.is-selected` card highlight, action bar, Delete-disabled, toast-undo-form. Existing CSS vars + transitions. |
| `tests/unit/recipes/repository.test.ts` | Add cases for `softDeleteMany` / `restoreMany`. |
| `tests/http/undo-toast.test.ts` | Update the single-restore Undo assertion from an `<a href>` to a POST form; add bulk-delete / bulk-restore cases. |
| `tests/http/static.test.ts` | Add `GET /static/bulk-select.js` served + contains `BulkSelect`. |

---

## 4 · Data flow

1. **Render** — each card/row carries `data-recipe-id` and a `.check`. The action bar and an empty `#toast-area` are present. Nothing selection-related is visible at rest.
2. **Enter mode** — long-press or hover-check click. Controller sets `mode = true`, adds `.is-selecting` to the library root (CSS reveals all checks), pre-selects the originating recipe, wires card-click-as-toggle.
3. **Select/deselect** — controller adds/removes the id in its `Set`, toggles `.is-selected` + the check's `.on`, updates the count and the Delete button's disabled state, and resyncs the hidden form's `ids` inputs.
4. **Swap reapplies selection** — on `htmx:afterSwap` for `#grid` (search/filter/sort), the controller re-marks any visible card whose id is in the `Set` and re-binds long-press on the new card nodes. The `Set` itself is untouched, so hidden selections survive.
5. **Delete** — the Delete button submits the hidden htmx form (`hx-post="/recipes/bulk-delete"`, target `#grid`). Its `ids` hidden inputs mirror the `Set`. The server soft-deletes, returns the refreshed grid partial **+** an OOB `<div id="toast-area" hx-swap-oob="true">` containing the rendered toast (with a POST-form Undo carrying the same ids). htmx swaps both. On the form's `htmx:afterRequest` (success) the controller clears the `Set` and exits mode.
6. **Undo** — the toast's Undo is an htmx form (`hx-post="/recipes/bulk-restore"`, target `#grid`) with the ids as hidden fields. The server restores, returns the refreshed grid + an empty `#toast-area` OOB (clears the toast).

---

## 5 · Backend contract

### Repository (`RecipeRepository`)

```
softDeleteMany(ids: number[]): void
restoreMany(ids: number[]): void
```

- `ids` may be empty (no-op). Non-integer / non-existent ids are ignored by the caller (validation at the route).
- Implementation: one parameterized statement each — `UPDATE recipes SET deleted_at = datetime('now') WHERE id IN (?,?,…)` / `… SET deleted_at = NULL …` — placeholders built to match `ids.length`, run inside a transaction. Reuses the existing `deleted_at` soft-delete column already used by `softDelete`/`restore`.

### Routes (`recipeRoutes`)

- **`POST /recipes/bulk-delete`**
  - Body: repeated `ids` form fields (e.g. `ids=1&ids=5&ids=9`).
  - Validate: parse `form.getAll("ids")` → numbers → keep positive integers; if none remain → `400`.
  - `recipes.softDeleteMany(validIds)`.
  - **HX-Request:** respond 200 with the refreshed `partials/grid.html` (rendered exactly as `GET /recipes` renders it for the same query/tag/sort) concatenated with an OOB `<div id="toast-area" hx-swap-oob="true">` containing `partials/toast.html` (`toast = "Deleted N recipe(s)."`, `undo_url = "/recipes/bulk-restore"`, `undo_ids = validIds`).
  - **Non-HX fallback:** the action bar is JS-driven so this path is effectively unreachable; for safety, redirect to `/recipes` with a plain `toast` and no undo.
- **`POST /recipes/bulk-restore`**
  - Body: repeated `ids`. Same validation; `recipes.restoreMany(validIds)`.
  - **HX-Request:** respond 200 with refreshed grid + empty OOB `#toast-area` (clears the toast).
  - **Non-HX fallback:** redirect to `/recipes`.

Grid rendering for these responses reuses the existing query/tag/sort/tag-map logic from the `GET /recipes` handler (factored out so both the list route and the bulk routes share it).

---

## 6 · Toast / Undo unification (fixes single-restore)

The existing single-delete toast renders Undo as a plain `<a href="/recipes/:id/restore">`, but `/recipes/:id/restore` is registered **POST-only** — so that undo link does not fire today. This spec fixes it by making Undo a real POST submission, and unifies the toast markup:

- **New `partials/toast.html`** renders: message, optional Undo as a `<form method="post" action="{{ undo_url }}">` containing one `<input type="hidden" name="ids" value="{{ id }}">` per `undo_ids` (omitted for single-restore, where the id is in the URL), a submit button styled as the existing `.toast-undo`, a close button, and self-dismiss (close on click + auto-remove after 10 s).
- **Single-restore Undo** → POST form to `/recipes/:id/restore` (route unchanged, now reachable). Full-page redirect behavior is preserved.
- **Bulk-restore Undo** → same partial, but the form is htmx-enhanced (`hx-post`, `hx-target="#grid"`) and carries the ids, giving a no-reload undo.
- `library.html` renders this partial where the inline toast block was; the same partial is reused for the bulk OOB toast. `tests/http/undo-toast.test.ts` is updated to assert the POST form instead of the `<a href>`.

---

## 7 · Component contract (`bulk-select.js`)

Framework-free IIFE, mirroring `tags-input.js` (class + `initAll()` guarded by a `data-*` initialized flag, DOMContentLoaded-safe). One controller per `[data-bulk-select]` root:

- **State:** `selected: Set<number>`, `mode: boolean`.
- **Entry:** bind long-press (pointerdown timer ~500 ms, canceled by scroll/pointermove/pointerup-before-fire, `preventDefault()` on fire to stop context menu + `<a>` nav) and hover-check click (pointer only) on every `[data-recipe-id]` node.
- **Mode on:** add `.is-selecting` to root; intercept clicks on cards/rows (and their checks) to toggle selection instead of navigating; stop propagation on the favorite heart so it still works.
- **Toggle(id):** add/remove from `Set`; update `.is-selected` + `.check.on`; `renderCount()`; `syncDeleteForm()`.
- **Select all / Clear:** add all visible `[data-recipe-id]` / empty the `Set`, then refresh visuals.
- **Delete:** the visible Delete button has `form="bulk-delete-form"` (a hidden `<form id="bulk-delete-form" hx-post="/recipes/bulk-delete" hx-target="#grid" hx-swap="innerHTML">`); before submit, `syncDeleteForm()` rebuilds its `ids` hidden inputs from the `Set`. On the form's `htmx:afterRequest` (success), clear the `Set` and exit mode.
- **Exit:** `Cancel` button or `Esc` → `mode=false`, remove `.is-selecting`, clear the `Set`, refresh visuals.
- **Swap resilience:** on `htmx:afterSwap` where `target.id === "grid"`, re-apply `.is-selected`/`.check.on` for visible cards whose id is in the `Set`, and re-bind long-press on new nodes. (Extends the existing `afterSwap` listener in `library.html`.)
- **Toast dismiss:** on init and after swap, wire any `[data-toast]` close button + 10 s auto-remove (so both page-load and OOB-swapped toasts behave).
- **ARIA:** checks are `<button aria-pressed>`, the action bar is a `role="toolbar"` region with an `aria-live="polite"` count.

---

## 8 · Styling

New classes in `app.tailwind.css`, all using existing CSS vars so light/dark/auto adapt automatically:

- `.check` — circular, absolutely positioned top-left, `display:none` by default. Revealed by `.card-wrap:hover .check` **wrapped in `@media (hover: hover)`** (so touch devices never get sticky revealed checks after a tap) and by `.is-selecting .check` (always, in mode, applies to all devices). `.on` state fills with `--color-accent` and a white check glyph.
- `.card-wrap.is-selected .card` — accent border + 2 px accent ring (mirrors the hover treatment).
- `.is-selecting .card` — `cursor: default` to signal navigation is suppressed.
- Action bar — sticky bottom, `--color-surface` with top border + subtle upward shadow; danger Delete reuses `.btn--danger`; disabled Delete is muted + non-interactive.
- `.toast-undo-form` — inline, marginless; its submit button reuses `.toast-undo` so the visual is identical to the old link.

Transitions reuse the existing durations (`gridFade` for the swap, `.card` transition for selection highlight).

---

## 9 · Testing

**Unit (`tests/unit/recipes/repository.test.ts`):**
- `softDeleteMany([a,b])` removes both from `list()`; leaves others; tolerates a non-existent id in the array; transactional (all-or-nothing on a thrown statement).
- `restoreMany([...])` brings them back into `list()`.

**HTTP (`tests/http/undo-toast.test.ts` and recipe tests):**
- `POST /recipes/bulk-delete` (HX) with ids → 200, body is the grid partial (deleted titles absent) + an OOB `#toast-area` containing the toast with `Deleted …` and a bulk-restore Undo form carrying the ids.
- `POST /recipes/bulk-delete` with no/invalid ids → 400.
- `POST /recipes/bulk-delete` (non-HX) → 302 to `/recipes`.
- `POST /recipes/bulk-restore` (HX) with ids → 200, grid contains the restored titles, `#toast-area` OOB is empty.
- Single-restore Undo is now a POST form (assert `action="/recipes/:id/restore"` inside a `<form method="post">`, not an `<a href>`). The existing `undo_url`-contains-`restore` assertion is kept/updated.

**Static (`tests/http/static.test.ts`):**
- `GET /static/bulk-select.js` → 200, body contains `BulkSelect`.

The controller's DOM/gesture behavior (long-press timing, hover-reveal, suppression of navigation) is verified manually; there is no browser test runner in the project, consistent with `tags-input.js`.

---

## 10 · Out of scope & notes

- Future bulk actions (tag, favorite, export) can be added to the action bar; only Delete ships now. The hidden-form + `Set` pattern generalizes by swapping the form's `hx-post` target.
- Selection does not persist across a full page load or the cards↔list view toggle (a full POST/redirect). This is accepted; selection is a transient, per-page-load interaction.
- Bulk delete is intentionally htmx-only for the slick no-reload flow; the non-HX fallback is a best-effort redirect without undo.
- No new runtime dependency is introduced.
