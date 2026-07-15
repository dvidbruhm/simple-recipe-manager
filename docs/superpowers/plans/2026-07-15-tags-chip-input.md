# Tags Chip Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the comma-separated tags text field on the recipe edit page with a chip-based combobox (vanilla JS) that suggests existing tags and allows creating new ones.

**Architecture:** A framework-free `tags-input.js` controller enhances a `data-tags-input` container server-rendered by Nunjucks. Selected tags are stored as one hidden `<input name="tags">` per chip and submitted with `form.getAll("tags")` (no comma-joining). Suggestions come from a JSON endpoint that reads existing tags from the DB — so with no tags in the DB there are no suggestions; new tags are still creatable by typing + Enter.

**Tech Stack:** Hono + Bun, Nunjucks, Tailwind v4 (CSS rebuilt via `bun run build:css`), vanilla JS, `bun:test` HTTP-level tests.

**Spec:** `docs/superpowers/specs/2026-07-15-tags-chip-input-design.md`

**Conventions:** Conventional commits (`feat(ui):`, `feat(tags):`, etc.). Tests are in `tests/http/`. Run tests with `bun test`. Lint with `bun run lint` (biome). Typecheck with `bun run typecheck`. Note: `src/ui/static/**` and `src/ui/css/**` are excluded from biome lint/format — match the existing 2-space indentation in those files.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `src/tags/routes.ts` | Tags autocomplete endpoint | Repurpose `/tags/autocomplete` to return JSON `string[]`; remove now-dead HTML-escaping helper |
| `src/recipes/routes.ts` | Recipe CRUD routes | POST handler reads `form.getAll("tags")`; edit route drops `tags_text` |
| `src/ui/templates/recipe-edit.html` | Edit form markup | Replace tags `<input>` with `data-tags-input` chip container; load `tags-input.js` |
| `src/ui/static/tags-input.js` | Vanilla JS chips controller (new) | Manage chips, dropdown, keyboard nav, ARIA, hidden fields |
| `src/ui/css/app.tailwind.css` | Tailwind entry + component CSS | Add `.tags-input*` styles; rebuild `app.css` |
| `tests/http/theme-and-autocomplete.test.ts` | Autocomplete tests | Update 3 assertions from HTML to JSON |
| `tests/http/recipe-view-edit.test.ts` | Edit form + submission tests | Update chip-rendering assertion; switch tag submission to repeated `tags` fields |
| `tests/http/static.test.ts` | Static-asset tests | Add a test for `/static/tags-input.js` |

---

## Task 1: Switch `/tags/autocomplete` to JSON

**Files:**
- Test: `tests/http/theme-and-autocomplete.test.ts` (the 3 tests in `describe("GET /tags/autocomplete", ...)`, around lines 52–91)
- Modify: `src/tags/routes.ts:21-29` (and remove the now-unused `escapeHtml`/`ESC` at `:5-15`)

- [ ] **Step 1: Update the 3 autocomplete tests to expect JSON**

In `tests/http/theme-and-autocomplete.test.ts`, replace the three tests inside `describe("GET /tags/autocomplete", ...)` with:

```ts
		it("returns matching tag names as JSON for a query prefix", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete?q=des", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual(["dessert"]);
		});

		it("returns an empty JSON array when q is missing", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/tags/autocomplete", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual([]);
		});

		it("round-trips tag names with HTML-special characters as JSON data", async () => {
			process.env.APP_PASSWORD = "pw";
			process.env.SESSION_SECRET = SECRET;
			const dataDir = freshDataDir();
			process.env.DATA_DIR = dataDir;
			const db = new Database(`${dataDir}/recipes.db`);
			migrate(db);
			const recipes = new RecipeRepository(db);
			const tags = new TagRepository(db);
			const id = recipes.insert({ title: "X", ingredients: [], steps: [] });
			tags.replaceForRecipe(id, ["<b>bold</b>"]);
			db.close();
			const app = buildApp();
			const cookie = await createSessionCookie(SECRET, 3600);
			const res = await app.request("/tags/autocomplete?q=%3Cb", auth(cookie));
			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type") ?? "").toContain("application/json");
			expect(JSON.parse(await res.text())).toEqual(["<b>bold</b>"]);
		});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: FAIL — the endpoint still returns HTML `<li ...>`, so `JSON.parse` throws (or assertions on JSON structure fail).

- [ ] **Step 3: Repurpose the endpoint to return JSON**

Replace the entire contents of `src/tags/routes.ts` with:

```ts
import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { TagRepository } from "./repository";

export function tagRoutes(db: Database): Hono {
	const app = new Hono();
	const tags = new TagRepository(db);

	app.get("/tags/autocomplete", (c) => {
		const q = c.req.query("q") ?? "";
		if (q.length < 1) return c.json([]);
		const names = tags.autocomplete(q);
		return c.json(names);
	});

	return app;
}
```

(This removes the now-unused `ESC` map and `escapeHtml` function — confirmed they are only referenced by the old HTML response.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: PASS — all 3 autocomplete tests green.

- [ ] **Step 5: Commit**

```bash
git add src/tags/routes.ts tests/http/theme-and-autocomplete.test.ts
git commit -m "feat(tags): return autocomplete suggestions as JSON"
```

---

## Task 2: Submit tags as repeated form fields (`form.getAll`)

**Files:**
- Test: `tests/http/recipe-view-edit.test.ts` (the test "POST /recipes/:id updates tags and view reflects them", around lines 139–161)
- Modify: `src/recipes/routes.ts:84-88` (the tags parsing in `POST /recipes/:id`)

- [ ] **Step 1: Update the tag-submission test to use repeated `tags` fields**

In `tests/http/recipe-view-edit.test.ts`, in the test `"POST /recipes/:id updates tags and view reflects them"`, replace the line `fd.set("tags", "spicy, quick");` with two appends:

```ts
		fd.set("rating", "0");
		fd.append("tags", "spicy");
		fd.append("tags", "quick");
```

(Leave the rest of that test unchanged — it still asserts the view contains "spicy" and "quick" and not "dessert"/"italian".)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/recipe-view-edit.test.ts`
Expected: FAIL — the old handler does `String(form.get("tags"))` which returns only the first value `"spicy"`, splits on comma (no comma) → `["spicy"]`. The view then contains "spicy" but NOT "quick", failing the assertion.

- [ ] **Step 3: Switch the POST handler to `form.getAll("tags")`**

In `src/recipes/routes.ts`, inside `app.post("/recipes/:id", ...)`, find these two lines:

```ts
		const tagsRaw = String(form.get("tags") ?? "");
		const tagsList = tagsRaw
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
```

Replace them with:

```ts
		const tagsList = form
			.getAll("tags")
			.map((s) => String(s).trim())
			.filter(Boolean);
```

- [ ] **Step 4: Run the full recipe-view-edit suite to verify it passes**

Run: `bun test tests/http/recipe-view-edit.test.ts`
Expected: PASS — all tests green, including the two that submit `fd.set("tags", "")` (a single empty string → `getAll` returns `[""]` → trim/filter → `[]`, clearing tags) and the updated repeated-field test.

- [ ] **Step 5: Commit**

```bash
git add src/recipes/routes.ts tests/http/recipe-view-edit.test.ts
git commit -m "feat(recipes): submit tags as repeated form fields"
```

---

## Task 3: Chip input markup + edit route

**Files:**
- Test: `tests/http/recipe-view-edit.test.ts:83` (prefill assertion in "GET /recipes/:id/edit returns 200 with all fields pre-filled")
- Modify: `src/ui/templates/recipe-edit.html:51-54` (the tags block)
- Modify: `src/recipes/routes.ts:67` (drop `tags_text`)

- [ ] **Step 1: Update the prefill assertion to expect chips**

In `tests/http/recipe-view-edit.test.ts`, in the test `"GET /recipes/:id/edit returns 200 with all fields pre-filled"`, find the line:

```ts
		expect(body).toContain("dessert, italian");
```

Replace it with:

```ts
		expect(body).toContain('data-chip="dessert"');
		expect(body).toContain('data-chip="italian"');
		expect(body).toContain('name="tags" value="dessert"');
		expect(body).toContain('name="tags" value="italian"');
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/recipe-view-edit.test.ts`
Expected: FAIL — the old template renders a single `<input value="dessert, italian">` with no `data-chip` attributes, so the new assertions miss.

- [ ] **Step 3: Replace the tags block in the template**

In `src/ui/templates/recipe-edit.html`, replace the tags block (the `<div>` containing the `<label for="tags">` and the `<input type="text" id="tags" name="tags" ...>`) — currently lines 51–54:

```html
    <div>
      <label for="tags" class="block text-sm font-medium text-[color:var(--color-text)] mb-1">Tags (comma-separated)</label>
      <input type="text" id="tags" name="tags" value="{{ tags_text }}" class="w-full px-3 py-2 rounded border border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-text)]">
    </div>
```

with:

```html
    <div>
      <label class="block text-sm font-medium text-[color:var(--color-text)] mb-1">Tags</label>
      <div class="tags-input" data-tags-input>
        <ul class="tags-input__chips" data-tags-chips>
          {% for name in tags %}
            <li class="tags-input__chip" data-chip="{{ name }}">
              <span>{{ name }}</span>
              <button type="button" class="tags-input__remove" data-remove="{{ name }}" aria-label="Remove {{ name }}">&times;</button>
            </li>
          {% endfor %}
        </ul>
        <input type="text" data-tags-field class="tags-input__field" placeholder="Type a tag and press Enter" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="tags-suggestions">
        <ul class="tags-input__suggestions" id="tags-suggestions" role="listbox" data-tags-suggestions hidden></ul>
        {% for name in tags %}
          <input type="hidden" name="tags" value="{{ name }}">
        {% endfor %}
      </div>
    </div>
```

- [ ] **Step 4: Drop `tags_text` from the edit route**

In `src/recipes/routes.ts`, inside `app.get("/recipes/:id/edit", ...)`, remove the line (currently `:67`):

```ts
				tags_text: tagRows.map((t) => t.name).join(", "),
```

The `tags` array is already passed one line above (`tags: tagRows.map((t) => t.name),`), which the template now uses directly. (Nunjucks is configured with `throwOnUndefined: true`, so removing the unused `tags_text` is required to avoid errors — do this in the same commit as the template change.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test tests/http/recipe-view-edit.test.ts`
Expected: PASS — chips and hidden inputs render for each tag.

- [ ] **Step 6: Commit**

```bash
git add src/ui/templates/recipe-edit.html src/recipes/routes.ts tests/http/recipe-view-edit.test.ts
git commit -m "feat(ui): render tags as chips on the edit form"
```

---

## Task 4: CSS for the chip input

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (append component styles)
- Rebuild: `src/ui/static/app.css` (committed build artifact)

No automated test for CSS; verified manually in Task 6.

- [ ] **Step 1: Append the chip-input styles**

At the end of `src/ui/css/app.tailwind.css`, append:

```css
.tags-input {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-bg);
  padding: 0.375rem;
  cursor: text;
}

.tags-input__chips {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}

.tags-input__chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.85rem;
}

.tags-input__remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-muted);
  padding: 0;
  line-height: 1;
  font-size: 1rem;
}

.tags-input__remove:hover {
  color: var(--color-accent);
}

.tags-input__field {
  flex: 1;
  min-width: 8rem;
  border: none;
  background: transparent;
  color: var(--color-text);
  font-size: 0.9rem;
  outline: none;
  padding: 0.25rem;
}

.tags-input__suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: var(--radius-card);
  max-height: 12rem;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.tags-input__suggestions li {
  padding: 0.375rem 0.625rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text);
}

.tags-input__suggestions li[aria-selected="true"],
.tags-input__suggestions li:hover {
  background: var(--color-bg);
  color: var(--color-accent);
}
```

- [ ] **Step 2: Rebuild the served CSS**

Run: `bun run build:css`
Expected: completes without error; `src/ui/static/app.css` now contains the new `.tags-input*` rules (verify with a quick `Select-String` / grep if desired).

- [ ] **Step 3: Verify the existing static-CSS test still passes**

Run: `bun test tests/http/static.test.ts`
Expected: PASS — `GET /static/app.css` still returns 200 with `body.length > 100`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat(ui): styles for tags chip input"
```

---

## Task 5: `tags-input.js` controller + script tag + static-asset test

**Files:**
- Test: `tests/http/static.test.ts` (add one test)
- Create: `src/ui/static/tags-input.js`
- Modify: `src/ui/templates/recipe-edit.html` (add `<script>` tag)

- [ ] **Step 1: Add a failing static-asset test**

In `tests/http/static.test.ts`, add a new `it` inside the `describe("static files", ...)` block:

```ts
	it("GET /static/tags-input.js returns the chips controller JS", async () => {
		const app = setup();
		const res = await app.request("/static/tags-input.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(100);
		expect(body).toContain("TagsInput");
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/static.test.ts`
Expected: FAIL — `GET /static/tags-input.js` returns 404 (file does not exist yet), so `res.status` is 404, not 200.

- [ ] **Step 3: Create the controller**

Create `src/ui/static/tags-input.js` with:

```js
(function () {
  const DEBOUNCE_MS = 150;

  class TagsInput {
    constructor(root, { suggestionsUrl }) {
      this.root = root;
      this.suggestionsUrl = suggestionsUrl;
      this.field = root.querySelector("[data-tags-field]");
      this.chipsList = root.querySelector("[data-tags-chips]");
      this.suggestionsEl = root.querySelector("[data-tags-suggestions]");
      this.selected = new Map();
      this.highlightIndex = -1;
      this._timer = null;
      this._abort = null;

      root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((input) => {
          const name = input.value.trim();
          if (name) this.selected.set(name.toLowerCase(), name);
        });
      this.renderChips();
      this.syncHidden();

      this.field.addEventListener("input", () => this.onInput());
      this.field.addEventListener("keydown", (e) => this.onKeyDown(e));
      this.field.addEventListener("blur", () => this.closeSuggestions(true));
      this.chipsList.addEventListener("click", (e) => this.onChipClick(e));
      this.suggestionsEl.addEventListener("mousedown", (e) => e.preventDefault());
      this.suggestionsEl.addEventListener("click", (e) => this.onSuggestionClick(e));
    }

    onChipClick(e) {
      const btn = e.target.closest("[data-remove]");
      if (!btn) return;
      this.remove(btn.getAttribute("data-remove"));
    }

    onSuggestionClick(e) {
      const li = e.target.closest("li[data-name]");
      if (!li) return;
      this.add(li.getAttribute("data-name"));
    }

    onInput() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this.fetchSuggestions(), DEBOUNCE_MS);
    }

    async fetchSuggestions() {
      const q = this.field.value.trim();
      if (!q) {
        this.closeSuggestions(false);
        return;
      }
      if (this._abort) this._abort.abort();
      this._abort = new AbortController();
      let names = [];
      try {
        const res = await fetch(
          `${this.suggestionsUrl}?q=${encodeURIComponent(q)}`,
          { signal: this._abort.signal },
        );
        if (res.ok) names = await res.json();
      } catch (e) {
        if (e && e.name === "AbortError") return;
        names = [];
      }
      this.renderSuggestions(names);
    }

    renderSuggestions(names) {
      const available = (names || []).filter(
        (n) => !this.selected.has(n.toLowerCase()),
      );
      this.suggestionsEl.innerHTML = "";
      if (available.length === 0) {
        this.closeSuggestions(false);
        return;
      }
      for (const name of available) {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("data-name", name);
        li.textContent = name;
        this.suggestionsEl.appendChild(li);
      }
      this.highlightIndex = -1;
      this.openSuggestions();
    }

    openSuggestions() {
      this.suggestionsEl.hidden = false;
      this.field.setAttribute("aria-expanded", "true");
    }

    closeSuggestions(clearField) {
      this.suggestionsEl.hidden = true;
      this.suggestionsEl.innerHTML = "";
      this.highlightIndex = -1;
      this.field.setAttribute("aria-expanded", "false");
      if (clearField) this.field.value = "";
    }

    highlight(delta) {
      const items = this.suggestionsEl.querySelectorAll("li[data-name]");
      if (items.length === 0) return;
      let idx = this.highlightIndex + delta;
      if (idx < 0) idx = items.length - 1;
      if (idx >= items.length) idx = 0;
      this.highlightIndex = idx;
      items.forEach((li, i) =>
        li.setAttribute("aria-selected", i === idx ? "true" : "false"),
      );
      const el = items[idx];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
    }

    highlightedName() {
      const items = this.suggestionsEl.querySelectorAll("li[data-name]");
      const el = items[this.highlightIndex];
      return el ? el.getAttribute("data-name") : null;
    }

    onKeyDown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        const picked = this.highlightedName();
        if (picked) this.add(picked);
        else if (this.field.value.trim()) this.add(this.field.value.trim());
      } else if (
        e.key === "Backspace" &&
        this.field.value === "" &&
        this.selected.size > 0
      ) {
        const lastKey = Array.from(this.selected.keys()).pop();
        if (lastKey) this.remove(this.selected.get(lastKey));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (this.suggestionsEl.hidden) this.fetchSuggestions();
        else this.highlight(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.highlight(-1);
      } else if (e.key === "Escape") {
        this.closeSuggestions(true);
      }
    }

    add(rawName) {
      const name = (rawName || "").trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (this.selected.has(key)) {
        this.closeSuggestions(true);
        return;
      }
      this.selected.set(key, name);
      this.appendChip(name);
      this.appendHidden(name);
      this.closeSuggestions(true);
    }

    remove(rawName) {
      const name = (rawName || "").trim();
      const key = name.toLowerCase();
      const original = this.selected.get(key);
      if (!original) return;
      this.selected.delete(key);
      this.chipsList.querySelectorAll("[data-chip]").forEach((li) => {
        if (li.getAttribute("data-chip") === original) li.remove();
      });
      this.root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((input) => {
          if (input.value === original) input.remove();
        });
    }

    appendChip(name) {
      const li = document.createElement("li");
      li.className = "tags-input__chip";
      li.setAttribute("data-chip", name);
      const span = document.createElement("span");
      span.textContent = name;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tags-input__remove";
      btn.setAttribute("data-remove", name);
      btn.setAttribute("aria-label", `Remove ${name}`);
      btn.textContent = "\u00d7";
      li.appendChild(span);
      li.appendChild(btn);
      this.chipsList.appendChild(li);
    }

    appendHidden(name) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "tags";
      input.value = name;
      this.root.appendChild(input);
    }

    renderChips() {
      this.chipsList.innerHTML = "";
      for (const name of this.selected.values()) this.appendChip(name);
    }

    syncHidden() {
      this.root
        .querySelectorAll('input[type="hidden"][name="tags"]')
        .forEach((el) => el.remove());
      for (const name of this.selected.values()) this.appendHidden(name);
    }
  }

  function initAll() {
    document.querySelectorAll("[data-tags-input]").forEach((el) => {
      if (el.dataset.tagsInitialized) return;
      const url = el.getAttribute("data-suggestions-url") || "/tags/autocomplete";
      new TagsInput(el, { suggestionsUrl: url });
      el.dataset.tagsInitialized = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
```

- [ ] **Step 4: Add the script tag to the edit template**

In `src/ui/templates/recipe-edit.html`, immediately before the existing `<script>` block that begins `window.addEventListener('paste', ...)` (near the bottom of the file, before `{% endblock %}`), add:

```html
<script src="/static/tags-input.js" defer></script>
```

- [ ] **Step 5: Run the static test to verify it passes**

Run: `bun test tests/http/static.test.ts`
Expected: PASS — `GET /static/tags-input.js` returns 200, body contains `TagsInput`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/static/tags-input.js src/ui/templates/recipe-edit.html tests/http/static.test.ts
git commit -m "feat(ui): vanilla JS chips controller for tags input"
```

---

## Task 6: Final verification

**Files:** none (verification only — no commit unless an issue is found)

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: ALL tests pass (autocomplete JSON, repeated `tags` submission, chip rendering, static JS asset, plus all previously-passing tests).

- [ ] **Step 2: Typecheck and lint**

Run: `bun run typecheck`
Expected: no errors.

Run: `bun run lint`
Expected: "Checked N files. No fixes applied." (or only formatting in already-excluded static/css dirs, which biome skips).

- [ ] **Step 3: Rebuild CSS to be safe**

Run: `bun run build:css`
Expected: completes without error; `app.css` up to date.

- [ ] **Step 4: Manual smoke test**

Run: `APP_PASSWORD=dev bun src/server.ts` (or `bun run dev`), open `http://localhost:3000/recipes`, sign in, edit a recipe, and verify:
- Existing tags render as chips with a × button.
- Typing a prefix of an existing tag shows a filtered dropdown (excluding already-selected); clicking a suggestion adds a chip.
- Pressing Enter on typed text adds a brand-new tag as a chip (free-text creation).
- Backspace on an empty field removes the last chip; clicking a chip's × removes it.
- ArrowUp/Down navigate the dropdown; Esc closes it; blur clears typed text without adding.
- A case-variant of an existing tag (e.g. `Dessert` when `dessert` is present) is ignored.
- Save the form; the view shows the updated tags; reloading the edit form shows the chips.

- [ ] **Step 5: Commit only if a fix was needed**

If Step 1–4 surfaced any defect, fix it and commit with `fix(ui): ...`. Otherwise, no commit — the feature is complete.

---

## Self-review notes

- **Spec coverage:** §2 interaction (Enter/click/backspace/arrows/Esc/blur) → Task 5 controller. §3 file map → all tasks. §4 data flow (server-rendered hidden inputs → JS reconcile → submit repeated `tags` → `getAll`) → Tasks 2, 3, 5. §5 JSON endpoint → Task 1. §6 component contract → Task 5. §7 styling → Task 4. §8 testing (endpoint, edit-render, submission, empty) → Tasks 1, 2, 3, 5. All spec sections covered.
- **Placeholders:** none; every code step contains full code.
- **Type/name consistency:** `data-tags-input`, `data-tags-field`, `data-tags-chips`, `data-tags-suggestions`, `data-chip`, `data-remove`, `data-name`, `data-suggestions-url`, `tags-input__*` class names are used consistently across template (Task 3), CSS (Task 4), and JS (Task 5). The `suggestionsUrl` option and `/tags/autocomplete` default match the endpoint changed in Task 1.
