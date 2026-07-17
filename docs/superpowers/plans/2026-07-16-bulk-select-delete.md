# Bulk Select & Delete Recipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select to the recipe library (long-press on touch, hover-revealed check on pointer) with a sticky bottom action bar, and ship bulk delete with a single-Undo restore.

**Architecture:** A framework-free `bulk-select.js` controller manages an in-memory `Set` of selected recipe ids on `[data-bulk-select]`, re-applied after every htmx grid swap so selection survives search/filter/sort. Delete is an htmx request that soft-deletes the ids and returns the refreshed grid partial plus an out-of-band toast; the toast's Undo is a self-contained htmx form that restores all ids at once. A shared `libraryGridHtml(c)` helper keeps grid rendering identical between `GET /recipes` and the bulk routes.

**Tech Stack:** Hono + Bun, Nunjucks, Tailwind v4 (CSS rebuilt via `bun run build:css`), htmx, vanilla JS, `bun:test` (HTTP-level + repository unit).

**Spec:** `docs/superpowers/specs/2026-07-16-bulk-select-delete-design.md`

**Conventions:** Conventional commits (`feat(ui):`, `feat(recipes):`, `fix(...):`, `refactor(...):`). Tests run with `bun test`; typecheck `bun run typecheck`; lint `bun run lint` (biome). Indentation: **tabs** for `src/**/*.ts` and `tests/**/*.ts`; **2 spaces** for `src/ui/templates/**`, `src/ui/css/**`, `src/ui/static/**` (these are excluded from biome). After any CSS change, rebuild the committed artifact with `bun run build:css`.

> **⚠️ Working-tree prerequisite (read before Task 1):** As written, the working tree contains **uncommitted changes in files this plan also edits** — at least `src/recipes/routes.ts`, `src/recipes/repository.ts`, `src/ui/templates/library.html`, `src/ui/templates/partials/recipe-card.html`, `src/ui/css/app.tailwind.css`, `tests/http/undo-toast.test.ts`. If you execute the per-task `git add <file>` commits below on top of those uncommitted changes, the unrelated work will be swept into this feature's commits. **Before starting, either (a) commit or stash your current working-tree changes, or (b) execute this plan in a fresh worktree off a clean commit.** The line numbers / snippets in this plan match the working tree at authoring time; if you reset to a different base, re-read each file before editing.

---

## File map

| File | Responsibility | Change |
|---|---|---|
| `src/recipes/repository.ts` | Recipe persistence | Add `softDeleteMany(ids)` + `restoreMany(ids)` |
| `src/recipes/routes.ts` | Recipe routes | Extract `libraryList`/`libraryGridHtml`; add `POST /recipes/bulk-delete` + `POST /recipes/bulk-restore`; pass `undo_ids` to library render |
| `src/ui/templates/partials/toast.html` | Toast markup (new) | Render message + POST-form Undo (`undo_url`, `undo_ids[]`) + close button |
| `src/ui/templates/library.html` | Library page | `data-bulk-select` root; `#toast-area` via toast partial; include action bar; load `bulk-select.js` |
| `src/ui/templates/partials/recipe-card.html` | Card markup | `data-recipe-id` + `.check` toggle |
| `src/ui/templates/partials/recipe-list.html` | Row markup | `data-recipe-id` + `.check` toggle |
| `src/ui/templates/partials/bulk-actionbar.html` | Action bar (new) | Sticky bottom bar + hidden `#bulk-delete-form` |
| `src/ui/static/bulk-select.js` | Selection controller (new) | Selection Set, mode entry (long-press + hover-check), toggle/select-all/clear, count + disabled Delete, hidden-ids sync, Esc/Cancel exit, afterSwap re-bind, toast auto-dismiss |
| `src/ui/css/app.tailwind.css` | Component CSS | `.check`, `.is-selected` highlight, action bar, toast-undo-form |
| `tests/unit/recipes/repository.test.ts` | Repo unit tests | Add `softDeleteMany` / `restoreMany` cases |
| `tests/http/undo-toast.test.ts` | Toast tests | Assert single-restore Undo is now a POST form |
| `tests/http/bulk-select.test.ts` | Bulk route tests (new) | bulk-delete (HX + non-HX), bulk-restore, validation |
| `tests/http/static.test.ts` | Static asset tests | Add `/static/bulk-select.js` test |

---

## Task 1: Repository `softDeleteMany` / `restoreMany`

**Files:**
- Test: `tests/unit/recipes/repository.test.ts`
- Modify: `src/recipes/repository.ts` (add two methods after `restore`, ~line 102)

- [ ] **Step 1: Add failing unit tests**

In `tests/unit/recipes/repository.test.ts`, append two new `it` blocks inside the `describe("RecipeRepository", …)` block (after the `"soft-deletes and restores"` test):

```ts
	it("soft-deletes many recipes at once", () => {
		const repo = setup();
		const a = repo.insert({ title: "A" });
		const b = repo.insert({ title: "B" });
		const c = repo.insert({ title: "C" });
		repo.softDeleteMany([a, c]);
		expect(repo.list().map((r) => r.title)).toEqual(["B"]);
	});

	it("restores many recipes at once and ignores empty input", () => {
		const repo = setup();
		const a = repo.insert({ title: "A" });
		const b = repo.insert({ title: "B" });
		repo.softDeleteMany([a, b]);
		expect(repo.list()).toHaveLength(0);
		repo.restoreMany([a, b]);
		expect(repo.list().map((r) => r.title).sort()).toEqual(["A", "B"]);
		repo.restoreMany([]);
		expect(repo.list()).toHaveLength(2);
	});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/unit/recipes/repository.test.ts`
Expected: FAIL — `repo.softDeleteMany is not a function` / `repo.restoreMany is not a function`.

- [ ] **Step 3: Implement the two methods**

In `src/recipes/repository.ts`, immediately after the `restore(id)` method (currently ending at line 102), add:

```ts
	softDeleteMany(ids: number[]): void {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(", ");
		this.db
			.prepare(`UPDATE recipes SET deleted_at = datetime('now') WHERE id IN (${placeholders})`)
			.run(...ids);
	}

	restoreMany(ids: number[]): void {
		if (ids.length === 0) return;
		const placeholders = ids.map(() => "?").join(", ");
		this.db
			.prepare(`UPDATE recipes SET deleted_at = NULL WHERE id IN (${placeholders})`)
			.run(...ids);
	}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/unit/recipes/repository.test.ts`
Expected: PASS — all repository tests green.

- [ ] **Step 5: Commit**

```bash
git add src/recipes/repository.ts tests/unit/recipes/repository.test.ts
git commit -m "feat(recipes): add bulk soft-delete and restore to repository"
```

---

## Task 2: Extract shared library grid rendering helper

**Files:**
- Modify: `src/recipes/routes.ts` (the `GET /recipes` handler, ~lines 17–68; add `Context` import)

Pure refactor — no behavior change. Existing `tests/http/library.test.ts` tests guard it.

- [ ] **Step 1: Add the `Context` import**

In `src/recipes/routes.ts`, change the Hono import line (line 3) from:

```ts
import { Hono } from "hono";
```

to:

```ts
import { Hono, type Context } from "hono";
```

- [ ] **Step 2: Add the helper functions**

Inside `recipeRoutes(…)`, immediately after `const tags = new TagRepository(db);` (line 15) and before `app.get("/recipes", …)`, add:

```ts
	function libraryList(c: Context) {
		const q = c.req.query("q") ?? "";
		const selTags = (c.req.queries("tag") ?? []).filter(Boolean);
		const favOnly = selTags.includes("favorites");
		const normalTags = selTags.filter((t) => t !== "favorites");
		const sort = c.req.query("sort") ?? "";
		const view = getCookie(c, "view") === "list" ? "list" : "cards";
		const filtering = !!(q || normalTags.length || favOnly);
		let list = filtering
			? searchRecipes(db, { q, tags: normalTags, favorite: favOnly })
			: recipes.list();
		if (sort) list = sortRecipes(list, sort);
		const tagMap = tags.listForRecipes(list.map((r) => r.id));
		const recipesWithTags = list.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
		return {
			q,
			selTags,
			sort,
			view,
			filtering,
			recipesWithTags,
			hasAny: recipes.list().length > 0,
		};
	}

	function libraryGridHtml(c: Context): string {
		const data = libraryList(c);
		return render("partials/grid.html", {
			recipes: data.recipesWithTags,
			view: data.view,
			has_any: data.hasAny,
			is_filtered: data.filtering,
		});
	}
```

- [ ] **Step 3: Rewrite the `GET /recipes` handler to use the helper**

Replace the entire `app.get("/recipes", (c) => { … })` body (currently lines 17–68) with:

```ts
	app.get("/recipes", (c) => {
		const data = libraryList(c);
		if (c.req.header("HX-Request") === "true") {
			return c.html(libraryGridHtml(c));
		}
		const favCount = (
			db
				.query("SELECT COUNT(*) AS c FROM recipes WHERE favorite = 1 AND deleted_at IS NULL")
				.get() as { c: number }
		).c;
		const tagList = tags.listAllWithCounts();
		tagList.unshift({ name: "favorites", cnt: favCount });
		const toast = c.req.query("toast") ?? "";
		const undoUrl = c.req.query("undo_url") ?? "";
		return c.html(
			render("library.html", {
				recipes: data.recipesWithTags,
				tags: tagList,
				q: data.q,
				active_tags: data.selTags,
				active_sort: data.sort || "date-new",
				view: data.view,
				has_any: data.hasAny,
				is_filtered: data.filtering,
				toast,
				undo_url: undoUrl,
				title: "recipes",
				...themeVars(c),
			}),
		);
	});
```

- [ ] **Step 4: Run the library suite to verify nothing broke**

Run: `bun test tests/http/library.test.ts tests/http/recipe-view-edit.test.ts`
Expected: PASS — all existing tests green (filtering, sorting, view toggle, empty state, HX partial all unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/recipes/routes.ts
git commit -m "refactor(recipes): extract shared library grid rendering helper"
```

---

## Task 3: Toast partial + single-restore Undo as a POST form

**Files:**
- Test: `tests/http/undo-toast.test.ts`
- Create: `src/ui/templates/partials/toast.html`
- Modify: `src/ui/templates/library.html` (replace the inline toast block, ~lines 52–66)
- Modify: `src/recipes/routes.ts` (pass `undo_ids: []` to the library render)

This fixes the latent bug where the single-delete Undo is a GET `<a>` pointing at the POST-only `/recipes/:id/restore` route.

- [ ] **Step 1: Add a failing test asserting the POST-form Undo**

In `tests/http/undo-toast.test.ts`, inside `describe("undo toast on library", …)`, add a new `it` after the first test (the one that GETs `/recipes?toast=Deleted&undo_url=/recipes/1/restore`):

```ts
	it("renders Undo as a POST form to the restore route, not a GET link", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes?toast=Deleted&undo_url=/recipes/1/restore", {
			headers: { Cookie: `session=${cookie}` },
		});
		const body = await res.text();
		expect(body).toContain('method="post"');
		expect(body).toContain('action="/recipes/1/restore"');
		expect(body).toContain('class="toast-undo"');
		expect(body).not.toContain('href="/recipes/1/restore"');
	});
```

- [ ] **Step 2: Run tests to verify the new test fails**

Run: `bun test tests/http/undo-toast.test.ts`
Expected: FAIL — the current toast renders `<a href="/recipes/1/restore" class="toast-undo">Undo</a>`, so `not.toContain('href="/recipes/1/restore"')` fails (and `method="post"` / `action=` are absent).

- [ ] **Step 3: Create the toast partial**

Create `src/ui/templates/partials/toast.html`:

```html
{% if toast %}
<div class="toast" data-toast>
  <span class="toast-msg">{{ toast }}</span>
  {% if undo_url %}
  <form class="toast-undo-form"
    {% if undo_ids and undo_ids.length %}
      hx-post="{{ undo_url }}" hx-target="#grid" hx-swap="innerHTML"
      hx-include="[name='q'], #current-sort, [name='tag']:checked"
    {% else %}
      method="post" action="{{ undo_url }}"
    {% endif %}>
    {% for id in undo_ids %}<input type="hidden" name="ids" value="{{ id }}">{% endfor %}
    <button type="submit" class="toast-undo">Undo</button>
  </form>
  {% endif %}
  <button type="button" class="toast-close" aria-label="Dismiss" onclick="this.closest('[data-toast]').remove()">&times;</button>
</div>
{% endif %}
```

(When `undo_ids` is non-empty the Undo is the bulk htmx form; when empty it is a normal POST to the single-restore URL — the id is already in that URL's path.)

- [ ] **Step 4: Render the partial from `library.html`**

In `src/ui/templates/library.html`, replace the entire inline toast block (the `{% if toast %} … {% endif %}` plus its `<script>`, currently lines 52–66):

```html
{% if toast %}
<div class="toast" data-toast>
  <span class="toast-msg">{{ toast }}</span>
  {% if undo_url %}
  <a href="{{ undo_url }}" class="toast-undo">Undo</a>
  {% endif %}
  <button class="toast-close" aria-label="Dismiss" onclick="this.parentElement.remove()">&times;</button>
</div>
<script>
  setTimeout(() => {
    const t = document.querySelector("[data-toast]");
    if (t) t.remove();
  }, 10000);
</script>
{% endif %}
```

with:

```html
<div id="toast-area">{% include "partials/toast.html" %}</div>
```

- [ ] **Step 5: Pass `undo_ids` to the library render**

In `src/recipes/routes.ts`, inside the `GET /recipes` non-HX render call (the `render("library.html", { … })` from Task 2), add `undo_ids: [],` next to the existing `undo_url: undoUrl,` line so it reads:

```ts
				toast,
				undo_url: undoUrl,
				undo_ids: [],
				title: "recipes",
```

(The toast partial references `undo_ids`; Nunjucks is configured with `throwOnUndefined: true`, so it must always be supplied. For the single-restore flow it is empty because the id is in the URL path.)

- [ ] **Step 6: Run the toast tests to verify they pass**

Run: `bun test tests/http/undo-toast.test.ts`
Expected: PASS — Undo now renders as a POST form; the earlier substring assertions (`/recipes/1/restore`, `Undo`, `class="toast"`) still hold.

- [ ] **Step 7: Commit**

```bash
git add src/ui/templates/partials/toast.html src/ui/templates/library.html src/recipes/routes.ts tests/http/undo-toast.test.ts
git commit -m "fix(recipes): make undo toast a POST form and extract toast partial"
```

---

## Task 4: Bulk delete + bulk restore routes

**Files:**
- Test: `tests/http/bulk-select.test.ts` (new)
- Modify: `src/recipes/routes.ts` (add two routes after the `POST /recipes/:id/favorite` handler, before `return app;`)

- [ ] **Step 1: Create the failing test file**

Create `tests/http/bulk-select.test.ts`:

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSessionCookie } from "@/auth/session";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { buildApp } from "@/server";

const SECRET = "test-secret";

function freshDataDir(): string {
	const dir = join(tmpdir(), `rmtest-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

async function setupApp() {
	process.env.APP_PASSWORD = "pw";
	process.env.SESSION_SECRET = SECRET;
	const dataDir = freshDataDir();
	process.env.DATA_DIR = dataDir;
	const db = new Database(`${dataDir}/recipes.db`);
	migrate(db);
	const recipes = new RecipeRepository(db);
	const id1 = recipes.insert({ title: "Tiramisu", ingredients: ["flour"] });
	const id2 = recipes.insert({ title: "Bolognese", ingredients: ["pasta"] });
	const id3 = recipes.insert({ title: "Ratatouille", ingredients: ["aubergine"] });
	db.close();
	const app = buildApp();
	const cookie = await createSessionCookie(SECRET, 3600);
	return { app, cookie, id1, id2, id3 };
}

function auth(cookie: string) {
	return { headers: { Cookie: `session=${cookie}` } };
}

function hx(cookie: string) {
	return { headers: { Cookie: `session=${cookie}`, "HX-Request": "true" } };
}

describe("bulk delete / restore", () => {
	it("POST /recipes/bulk-delete (HX) soft-deletes ids and returns grid + toast", async () => {
		const { app, cookie, id1, id2 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		fd.append("ids", String(id2));
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: fd,
			...hx(cookie),
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Ratatouille");
		expect(body).not.toContain("Tiramisu");
		expect(body).not.toContain("Bolognese");
		expect(body).toContain("Deleted 2 recipes");
		expect(body).toContain('id="toast-area"');
		expect(body).toContain('hx-post="/recipes/bulk-restore"');
		expect(body).toContain(`name="ids" value="${id1}"`);
		expect(body).toContain(`name="ids" value="${id2}"`);
	});

	it("POST /recipes/bulk-delete with no ids returns 400", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: new FormData(),
			...auth(cookie),
		});
		expect(res.status).toBe(400);
	});

	it("POST /recipes/bulk-delete (non-HX) redirects to /recipes with a toast", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		const res = await app.request("/recipes/bulk-delete", {
			method: "POST",
			body: fd,
			...auth(cookie),
		});
		expect(res.status).toBe(302);
		expect(res.headers.get("location") ?? "").toContain("/recipes?toast=");
	});

	it("POST /recipes/bulk-restore (HX) restores ids and clears the toast", async () => {
		const { app, cookie, id1, id2, id3 } = await setupApp();
		// delete two first
		const fd = new FormData();
		fd.append("ids", String(id1));
		fd.append("ids", String(id2));
		await app.request("/recipes/bulk-delete", { method: "POST", body: fd, ...hx(cookie) });

		const rfd = new FormData();
		rfd.append("ids", String(id1));
		rfd.append("ids", String(id2));
		const res = await app.request("/recipes/bulk-restore", {
			method: "POST",
			body: rfd,
			...hx(cookie),
		});
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain("Tiramisu");
		expect(body).toContain("Bolognese");
		expect(body).toContain('id="toast-area"');
		// toast-area is emptied (no toast inside)
		expect(body).not.toContain("Deleted");
		// id3 was never deleted
		expect(body).toContain("Ratatouille");
	});

	it("bulk-deleted recipes reappear in the normal library listing after restore", async () => {
		const { app, cookie, id1 } = await setupApp();
		const fd = new FormData();
		fd.append("ids", String(id1));
		await app.request("/recipes/bulk-delete", { method: "POST", body: fd, ...auth(cookie) });
		let lib = await (await app.request("/recipes", auth(cookie))).text();
		expect(lib).not.toContain("Tiramisu");

		const rfd = new FormData();
		rfd.append("ids", String(id1));
		await app.request("/recipes/bulk-restore", { method: "POST", body: rfd, ...auth(cookie) });
		lib = await (await app.request("/recipes", auth(cookie))).text();
		expect(lib).toContain("Tiramisu");
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/http/bulk-select.test.ts`
Expected: FAIL — `POST /recipes/bulk-delete` 404s (route does not exist yet).

- [ ] **Step 3: Add the two routes**

In `src/recipes/routes.ts`, immediately before `return app;` at the end of `recipeRoutes(…)`, add a small id-parsing helper and the two routes:

```ts
	function parseIds(values: FormDataEntryValue[]): number[] {
		const ids: number[] = [];
		for (const v of values) {
			const n = Number(String(v));
			if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
		}
		return ids;
	}

	app.post("/recipes/bulk-delete", async (c) => {
		const form = await c.req.formData();
		const ids = parseIds(form.getAll("ids"));
		if (ids.length === 0) return c.body("no ids", 400);
		recipes.softDeleteMany(ids);
		const n = ids.length;
		const toast = `Deleted ${n} recipe${n === 1 ? "" : "s"}.`;
		if (c.req.header("HX-Request") === "true") {
			const grid = libraryGridHtml(c);
			const toastHtml = render("partials/toast.html", {
				toast,
				undo_url: "/recipes/bulk-restore",
				undo_ids: ids,
			});
			return c.html(`${grid}<div id="toast-area" hx-swap-oob="true">${toastHtml}</div>`);
		}
		return c.redirect(`/recipes?toast=${encodeURIComponent(toast)}`);
	});

	app.post("/recipes/bulk-restore", async (c) => {
		const form = await c.req.formData();
		const ids = parseIds(form.getAll("ids"));
		if (ids.length === 0) return c.body("no ids", 400);
		recipes.restoreMany(ids);
		if (c.req.header("HX-Request") === "true") {
			return c.html(`${libraryGridHtml(c)}<div id="toast-area" hx-swap-oob="true"></div>`);
		}
		return c.redirect("/recipes");
	});
```

- [ ] **Step 4: Run the bulk tests to verify they pass**

Run: `bun test tests/http/bulk-select.test.ts`
Expected: PASS — all 5 bulk tests green.

- [ ] **Step 5: Commit**

```bash
git add src/recipes/routes.ts tests/http/bulk-select.test.ts
git commit -m "feat(recipes): add bulk delete and restore routes"
```

---

## Task 5: Selection hook markup on cards and rows

**Files:**
- Test: `tests/http/library.test.ts` (add one assertion-bearing test)
- Modify: `src/ui/templates/partials/recipe-card.html`
- Modify: `src/ui/templates/partials/recipe-list.html`

- [ ] **Step 1: Add a failing test for the markup hooks**

In `tests/http/library.test.ts`, inside `describe("library page", …)`, add:

```ts
	it("renders selection hooks (data-recipe-id + check) on each card", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain('data-recipe-id=');
		expect(body).toContain('class="check"');
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/library.test.ts`
Expected: FAIL — cards currently have no `data-recipe-id` or `class="check"`.

- [ ] **Step 3: Add the hook to the card partial**

In `src/ui/templates/partials/recipe-card.html`, change the opening wrap line (line 1) from:

```html
<div class="card-wrap relative h-full">
```

to:

```html
<div class="card-wrap relative h-full" data-recipe-id="{{ r.id }}">
  <button type="button" class="check" aria-label="Select {{ r.title }}">&#10003;</button>
```

(Keep the rest of the file — the `<a class="card …">`, body, and `{% include "partials/favorite-btn.html" %}` — unchanged. The `.check` is visually hidden until hover/selection-mode via CSS added in Task 6.)

- [ ] **Step 4: Add the hook to the list partial**

In `src/ui/templates/partials/recipe-list.html`, change the opening wrap line (line 1) from:

```html
<div class="list-wrap relative">
```

to:

```html
<div class="list-wrap relative" data-recipe-id="{{ r.id }}">
  <button type="button" class="check" aria-label="Select {{ r.title }}">&#10003;</button>
```

- [ ] **Step 5: Run the library tests to verify they pass**

Run: `bun test tests/http/library.test.ts`
Expected: PASS — including the new hooks test and all existing assertions.

- [ ] **Step 6: Commit**

```bash
git add src/ui/templates/partials/recipe-card.html src/ui/templates/partials/recipe-list.html tests/http/library.test.ts
git commit -m "feat(ui): add selection hook markup to recipe cards and rows"
```

---

## Task 6: CSS for selection + action bar

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (append)
- Rebuild: `src/ui/static/app.css`

No automated CSS test; verified manually in Task 9. The static CSS test stays green.

- [ ] **Step 1: Append the selection + action-bar styles**

At the end of `src/ui/css/app.tailwind.css`, append:

```css
.check {
  position: absolute;
  top: 0.4rem;
  left: 0.4rem;
  z-index: 3;
  width: 1.4rem;
  height: 1.4rem;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 2px solid #fff;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 0.85rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}
.check:hover {
  background: rgba(0, 0, 0, 0.7);
}
.check.on {
  background: var(--color-accent);
  border-color: var(--color-accent);
}
@media (hover: hover) {
  .card-wrap:hover .check,
  .list-wrap:hover .check {
    display: flex;
  }
}
[data-bulk-select].is-selecting .check {
  display: flex;
}
.card-wrap.is-selected .card,
.list-wrap.is-selected > .list-row {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent);
}
[data-bulk-select].is-selecting .card,
[data-bulk-select].is-selecting .list-row {
  cursor: default;
}

.bulk-actionbar {
  display: none;
  position: sticky;
  bottom: 0;
  z-index: 10;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.8rem;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}
[data-bulk-select].is-selecting .bulk-actionbar {
  display: flex;
}
.bulk-count {
  font-weight: 600;
  font-size: 0.85rem;
}
.bulk-count__n {
  color: var(--color-accent);
}
.bulk-spacer {
  flex: 1;
}
.bulk-actionbar [data-bulk-delete][disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.toast-undo-form {
  display: inline;
  margin: 0;
}
```

- [ ] **Step 2: Rebuild the served CSS**

Run: `bun run build:css`
Expected: completes without error; `src/ui/static/app.css` now contains the `.check`, `.bulk-actionbar`, and `.toast-undo-form` rules.

- [ ] **Step 3: Verify the static CSS test still passes**

Run: `bun test tests/http/static.test.ts`
Expected: PASS — `GET /static/app.css` still returns 200 with `body.length > 100`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat(ui): styles for bulk selection and action bar"
```

---

## Task 7: Action bar partial + library wiring

**Files:**
- Test: `tests/http/library.test.ts` (add markup assertions)
- Create: `src/ui/templates/partials/bulk-actionbar.html`
- Modify: `src/ui/templates/library.html` (`data-bulk-select` root, include action bar)

- [ ] **Step 1: Add a failing test for the action bar + delete form**

In `tests/http/library.test.ts`, inside `describe("library page", …)`, add:

```ts
	it("renders the bulk action bar and hidden delete form", async () => {
		const { app, cookie } = await setupApp();
		const res = await app.request("/recipes", { headers: { Cookie: `session=${cookie}` } });
		const body = await res.text();
		expect(body).toContain('data-bulk-select');
		expect(body).toContain('data-bulk-actionbar');
		expect(body).toContain('id="bulk-delete-form"');
		expect(body).toContain('data-bulk-delete');
		expect(body).toContain('hx-post="/recipes/bulk-delete"');
		expect(body).toContain("Cancel");
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/library.test.ts`
Expected: FAIL — the action bar / form / `data-bulk-select` are not present yet.

- [ ] **Step 3: Create the action bar partial**

Create `src/ui/templates/partials/bulk-actionbar.html`:

```html
<form id="bulk-delete-form" hidden aria-hidden="true"></form>
<div class="bulk-actionbar" data-bulk-actionbar role="toolbar" aria-label="Bulk actions">
  <span class="bulk-count" aria-live="polite"><span class="bulk-count__n" data-bulk-count>0</span> selected</span>
  <span class="bulk-spacer"></span>
  <button type="button" class="btn" data-bulk-select-all>Select all</button>
  <button type="button" class="btn" data-bulk-clear>Clear</button>
  <button type="button" class="btn btn--danger" data-bulk-delete disabled
    hx-post="/recipes/bulk-delete" hx-target="#grid" hx-swap="innerHTML"
    hx-include="#bulk-delete-form, [name='q'], #current-sort, [name='tag']:checked"
    hx-disabled-elt="this">Delete</button>
  <button type="button" class="btn" data-bulk-cancel>Cancel</button>
</div>
```

- [ ] **Step 4: Wire the library page**

In `src/ui/templates/library.html`:

(a) On the `.library-layout` wrapper (currently `<div class="library-layout max-w-6xl mx-auto">`), add the selection root attribute:

```html
<div class="library-layout max-w-6xl mx-auto" data-bulk-select>
```

(b) Immediately before the closing `</main>` inside `.library-layout` (i.e. right after the `</div>` that closes `<div id="grid" …>`), include the action bar:

```html
    {% include "partials/bulk-actionbar.html" %}
```

The surrounding block should look like:

```html
    <div id="grid" class="{% if view == 'list' %}list-view flex flex-col gap-2{% else %}grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] auto-rows-fr gap-4{% endif %}">
      {% include "partials/grid.html" %}
    </div>
    {% include "partials/bulk-actionbar.html" %}
  </main>
```

- [ ] **Step 5: Run the library tests to verify they pass**

Run: `bun test tests/http/library.test.ts`
Expected: PASS — the action bar, hidden form, and `data-bulk-select` are all present.

- [ ] **Step 6: Commit**

```bash
git add src/ui/templates/partials/bulk-actionbar.html src/ui/templates/library.html tests/http/library.test.ts
git commit -m "feat(ui): bulk selection action bar and library wiring"
```

---

## Task 8: `bulk-select.js` controller + script tag + static test

**Files:**
- Test: `tests/http/static.test.ts` (add one test)
- Create: `src/ui/static/bulk-select.js`
- Modify: `src/ui/templates/library.html` (add `<script>` tag)

- [ ] **Step 1: Add a failing static-asset test**

In `tests/http/static.test.ts`, inside `describe("static files", …)`, add:

```ts
	it("GET /static/bulk-select.js returns the bulk-select controller JS", async () => {
		const app = setup();
		const res = await app.request("/static/bulk-select.js");
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body.length).toBeGreaterThan(100);
		expect(body).toContain("BulkSelect");
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/http/static.test.ts`
Expected: FAIL — `GET /static/bulk-select.js` returns 404.

- [ ] **Step 3: Create the controller**

Create `src/ui/static/bulk-select.js`:

```js
(function () {
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  class BulkSelect {
    constructor(root) {
      this.root = root;
      this.form = document.getElementById("bulk-delete-form");
      this.countEl = root.querySelector("[data-bulk-count]");
      this.deleteBtn = root.querySelector("[data-bulk-delete]");
      this.selectAllBtn = root.querySelector("[data-bulk-select-all]");
      this.clearBtn = root.querySelector("[data-bulk-clear]");
      this.cancelBtn = root.querySelector("[data-bulk-cancel]");
      this.selected = new Set();
      this.mode = false;
      this._timer = null;
      this._press = null;

      this.bindCards();
      this.bindControls();
      this.bindGlobal();
      this.wireToasts();
    }

    cards() {
      return this.root.querySelectorAll("[data-recipe-id]");
    }

    bindCards() {
      this.cards().forEach((card) => this.bindCard(card));
    }

    bindCard(card) {
      const id = Number(card.getAttribute("data-recipe-id"));
      card.addEventListener("click", (e) => this.onCardClick(e, id));
      card.addEventListener("pointerdown", (e) => this.onPointerDown(e, id));
      card.addEventListener("pointermove", (e) => this.onPointerMove(e));
      card.addEventListener("pointerup", () => this.cancelPress());
      card.addEventListener("pointerleave", () => this.cancelPress());
      card.addEventListener("contextmenu", (e) => {
        if (this.mode) e.preventDefault();
      });
      const check = card.querySelector(".check");
      if (check) check.addEventListener("click", (e) => this.onCheckClick(e, id));
    }

    bindControls() {
      if (this.selectAllBtn) this.selectAllBtn.addEventListener("click", () => this.selectAll());
      if (this.clearBtn) this.clearBtn.addEventListener("click", () => this.clear());
      if (this.cancelBtn) this.cancelBtn.addEventListener("click", () => this.exit());
      if (this.deleteBtn) {
        this.deleteBtn.addEventListener("htmx:afterRequest", (e) => {
          if (e.detail && e.detail.successful) this.onDeleted();
        });
      }
    }

    bindGlobal() {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.mode) this.exit();
      });
      document.body.addEventListener("htmx:afterSwap", (e) => {
        const t = e.detail && e.detail.target;
        if (t && t.id === "grid") {
          this.bindCards();
          this.applySelection();
        }
        this.wireToasts();
      });
    }

    enter(id) {
      this.mode = true;
      this.root.classList.add("is-selecting");
      if (id != null) this.toggle(id, true);
    }

    exit() {
      this.mode = false;
      this.root.classList.remove("is-selecting");
      this.selected.clear();
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    toggle(id, force) {
      const on = force !== undefined ? force : !this.selected.has(id);
      if (on) this.selected.add(id);
      else this.selected.delete(id);
      this.markCard(id, on);
      this.renderCount();
      this.syncForm();
    }

    markCard(id, on) {
      const card = this.root.querySelector('[data-recipe-id="' + id + '"]');
      if (!card) return;
      card.classList.toggle("is-selected", on);
      const check = card.querySelector(".check");
      if (check) check.classList.toggle("on", on);
    }

    applySelection() {
      this.cards().forEach((card) => {
        const id = Number(card.getAttribute("data-recipe-id"));
        const on = this.selected.has(id);
        card.classList.toggle("is-selected", on);
        const check = card.querySelector(".check");
        if (check) check.classList.toggle("on", on);
      });
    }

    selectAll() {
      this.cards().forEach((card) => {
        this.selected.add(Number(card.getAttribute("data-recipe-id")));
      });
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    clear() {
      this.selected.clear();
      this.applySelection();
      this.renderCount();
      this.syncForm();
    }

    renderCount() {
      if (this.countEl) this.countEl.textContent = String(this.selected.size);
      if (this.deleteBtn) {
        if (this.selected.size === 0) this.deleteBtn.setAttribute("disabled", "");
        else this.deleteBtn.removeAttribute("disabled");
      }
    }

    syncForm() {
      if (!this.form) return;
      this.form.querySelectorAll('input[name="ids"]').forEach((el) => el.remove());
      for (const id of this.selected) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "ids";
        input.value = String(id);
        this.form.appendChild(input);
      }
    }

    onDeleted() {
      this.selected.clear();
      this.exit();
    }

    onCardClick(e, id) {
      if (!this.mode) return;
      if (e.target.closest(".fav-btn") || e.target.closest(".check")) return;
      e.preventDefault();
      this.toggle(id);
    }

    onCheckClick(e, id) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.mode) this.enter(null);
      this.toggle(id);
    }

    onPointerDown(e, id) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest(".fav-btn")) return;
      this._press = { x: e.clientX, y: e.clientY };
      this._timer = setTimeout(() => {
        this._timer = null;
        if (this._press) {
          e.preventDefault();
          this.enter(id);
        }
      }, LONG_PRESS_MS);
    }

    onPointerMove(e) {
      if (!this._press) return;
      const dx = e.clientX - this._press.x;
      const dy = e.clientY - this._press.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) this.cancelPress();
    }

    cancelPress() {
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      this._press = null;
    }

    wireToasts() {
      document.querySelectorAll("[data-toast]").forEach((t) => {
        if (t.dataset.toastWired) return;
        t.dataset.toastWired = "true";
        setTimeout(() => {
          if (t.parentNode) t.remove();
        }, 10000);
      });
    }
  }

  function initAll() {
    document.querySelectorAll("[data-bulk-select]").forEach((el) => {
      if (el.dataset.bulkSelectInitialized) return;
      new BulkSelect(el);
      el.dataset.bulkSelectInitialized = "true";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
```

- [ ] **Step 4: Add the script tag to the library page**

In `src/ui/templates/library.html`, inside the existing `{% block content %}` `<script>` near the bottom (the one defining `selectSort` / the `htmx:afterSwap` gridFade listener), add this line immediately after that `</script>` closes (still inside `{% endblock %}`):

```html
<script src="/static/bulk-select.js" defer></script>
```

- [ ] **Step 5: Run the static test to verify it passes**

Run: `bun test tests/http/static.test.ts`
Expected: PASS — `GET /static/bulk-select.js` returns 200, body contains `BulkSelect`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/static/bulk-select.js src/ui/templates/library.html tests/http/static.test.ts
git commit -m "feat(ui): vanilla JS bulk-select controller"
```

---

## Task 9: Final verification

**Files:** none (verification only — commit only if a defect is found).

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: ALL tests pass — repository bulk methods, library, recipe view/edit, undo toast (POST-form), bulk-select routes, static JS asset, plus all previously-passing tests.

- [ ] **Step 2: Typecheck and lint**

Run: `bun run typecheck`
Expected: no errors.

Run: `bun run lint`
Expected: "Checked N files. No fixes applied." (biome skips `src/ui/static/**` and `src/ui/css/**`).

- [ ] **Step 3: Rebuild CSS to be safe**

Run: `bun run build:css`
Expected: completes without error; `app.css` up to date.

- [ ] **Step 4: Manual smoke test**

Run: `APP_PASSWORD=dev bun src/server.ts` (or `bun run dev`), open `http://localhost:3000/recipes`, sign in, and verify:

- At rest, no checkboxes or action bar are visible.
- **Pointer:** hover a card → a circular check appears top-left; clicking it enters selection mode (all checks appear, bottom action bar shows) and selects that card.
- **Touch:** long-press a card (~0.5 s) enters selection mode and selects it; a short tap still opens the recipe; scrolling does not trigger selection.
- In selection mode, clicking a card toggles its selection (does not navigate); the favorite heart still toggles independently; the count updates; Delete is disabled at 0 selected.
- Select all / Clear work; Esc and Cancel exit selection mode.
- Delete removes the selected cards (grid animates), a toast "Deleted N recipes" appears with Undo; clicking Undo brings them all back.
- Selection is sticky across a search/filter/sort change (select some, type in search, the still-visible selected ones stay marked; delete affects all selected).
- The toast auto-dismisses after ~10 s and its × closes it immediately.

- [ ] **Step 5: Commit only if a fix was needed**

If Steps 1–4 surface any defect, fix it and commit with `fix(ui): …` or `fix(recipes): …`. Otherwise, no commit — the feature is complete.

---

## Self-review notes

- **Spec coverage:** §1 goals/constraints → whole plan (no new dependency, sticky selection, both views). §2 interaction (long-press + hover-check entry, in-mode toggle, Select all/Clear/Cancel/Esc, delete→toast→Undo) → Tasks 5–8. §3 file map → all tasks. §4 data flow (entry → Set → toggle → afterSwap re-apply → delete via hidden form → OOB toast → Undo restore) → Tasks 4, 7, 8. §5 backend contract (`softDeleteMany`/`restoreMany`, bulk-delete/bulk-restore HX + non-HX, validation, shared grid render) → Tasks 1, 2, 4. §6 toast/single-restore POST-form fix + `#toast-area` → Task 3. §7 component contract → Task 8 (every listed responsibility mapped). §8 styling (`.check` with `@media (hover: hover)`, `.is-selected`, action bar, disabled Delete, `.toast-undo-form`) → Task 6. §9 testing (repository unit, bulk HTTP, static JS, single-restore POST-form assertion) → Tasks 1, 3, 4, 8. All spec sections covered.
- **Placeholders:** none — every code step contains complete code; every command has expected output.
- **Type/name consistency:** `data-recipe-id`, `data-bulk-select`, `data-bulk-actionbar`, `data-bulk-count`, `data-bulk-delete`, `data-bulk-select-all`, `data-bulk-clear`, `data-bulk-cancel`, `id="bulk-delete-form"`, `id="toast-area"`, `.is-selecting`, `.is-selected`, `.check`/`.check.on`, `.bulk-actionbar`, and the route paths `/recipes/bulk-delete` + `/recipes/bulk-restore` are identical across templates (Tasks 5, 7), CSS (Task 6), JS (Task 8), routes (Task 4), and tests (Tasks 3, 4, 5, 7, 8). `libraryList`/`libraryGridHtml`/`parseIds` are defined in Task 2/4 and used consistently. `softDeleteMany`/`restoreMany` (Task 1) match the route calls in Task 4.
