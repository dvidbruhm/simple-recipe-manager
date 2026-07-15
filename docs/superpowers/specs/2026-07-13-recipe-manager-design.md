# Recipe Manager — Design Spec

**Date:** 2026-07-13
**Status:** Draft (pending user review)

A self-hosted, ultra-lightweight, single-shared-library recipe manager. CRUD with great URL import, full-text search with tag filters, and a clean UI. No AI, no per-user accounts, no SPA build step.

---

## 1 · Goals & constraints

**Goals**
- Modern, minimalist, fast, ultra-lightweight recipe CRUD app for self-hosting.
- Excellent URL import that works on as many sites as possible, including French and English mainstream sites.
- Tag recipes, search by ingredient/title/steps, simple and clean UI.
- Single shared library used by a small family.
- Multi-format export (PDF / Markdown zip / JSON-LD) and multi-source import (Recipe Manager's own JSON-LD / RecipeSage JSON-LD export).
- Installable PWA on Android. From the Android share sheet, tap "Recipe Manager" to import the URL directly into the app — no copy/paste needed.

**Constraints**
- Target hardware: an older mini-PC with **4 GB total RAM**. Shared with other self-hosted apps. No room for a resident LLM or a headless Chromium.
- Hosted via [Runtipi](https://runtipi.io) on an Ubuntu LXC container in Proxmox. Runtipi terminates TLS, routes the subdomain, and manages the app lifecycle.
- No external cloud services: no hosted LLM, no hosted embeddings, no paid API keys.

**Out of scope (explicitly)**
- Per-user accounts, ownership, permissions.
- LLM-assisted recipe extraction (deterministic layers only; Hook left in design for future addition).
- Comments, ratings feeds, social features, meal planning, shopping lists.
- iOS Share-Target support (Safari doesn't implement the Web Share Target API; only outbound share works on iOS). The PWA still installs on iOS — just no share-to-import.
- Push notifications, real-time updates, websockets server.
- Offline editing or conflict resolution. PWA caches the app shell only; recipe data is fetched live from the server (see §13).
- Multi-tenant, public sign-up.
- Image editing, cropping, thumbnailing logic in the app (we just store the file as-is; the browser downsizes at display time).
- Importing from non-JSON formats (Paprika, CopyMeThat, Evernote, Pepperplate, Living Cookbook, CSV, etc.). v1 supports JSON-LD only (this app's own export + RecipeSage export). Other format adapters can be added later by following the §16 plugin interface.

---

## 2 · Stack & runtime

| Layer | Choice | Notes |
|---|---|---|
| Runtime | **Bun** (latest stable) | One process, single binary equivalent. Faster than Node and TS-native. |
| Language | **TypeScript** strict mode | `typescript@5`, no `any` outside test fixtures. |
| Web framework | **Hono** | TS-first, runs on Bun natively, ~60 KB installed. |
| Templating | **Nunjucks** (via `hono/nunjucks` or a thin adapter) | Jinja2-like syntax for server-rendered HTML fragments. |
| Styling | **Tailwind CSS v4** compiled at build time to a single ~10 KB `app.css` | CSS-only, no runtime, no client-side theme script. |
| Client interactivity | **HTMX 2** (loaded once, ~14 KB gz) | Limited to the library page (search box + tag chips). All other pages are full HTML responses. |
| Database | **SQLite** with **FTS5** extension | Single file at `/data/recipes.db`; transactional, no server. |
| HTML fetch | Native `fetch` with browser-like headers | No browser automation. |
| Recipe extraction | `recipe-scrapers` (TS port, v1.9+) | Tested to match Python upstream on mainstream FR+EN sites. |
| Readability fallback | `@mozilla/readability` | DOM scoring for sites without Schema.org. |
| Image manipulation | none | Stored as-imported; browser handles display sizing via `object-fit`. |
| Zip export | `archiver` (or Bun's native tar/zip if stable) | Produces `/export.zip` on demand. |
| PDF generation | **`pdfkit`** | Pure JS PDF library, no native deps, no Chromium. Streams to HTTP response. Minimal RAM footprint — ~30 MB peak during export of <200 recipes. Works on Bun. |
| JSON-LD parse/emit | `jsonld` or hand-rolled (simple) | Schema.org Recipe → JSON-LD converter. The schema is small enough that hand-rolled emission is fine; parsing reuses `recipe-scrapers` internals. |
| PWA manifest | hand-written `manifest.json` + icons | Static file served at `/manifest.webmanifest`. |
| Service worker | hand-written `/static/sw.js` (~30 lines) | Caches the app shell. See §13. |
| Container base | `oven/bun:1-debian` | Slim Debian image, ~150 MB. |

**Memory budget at idle (target):** ~40-80 MB RSS for the Bun process, SQLite negligible. Leaves room for everything else on the 4 GB box.

**Single-process, single port** bound to `0.0.0.0:${PORT}` (env, default `3000`). Runtipi's reverse proxy routes traffic from `https://recipes.<your-domain>` to the container's internal port.

---

## 3 · Data model

### 3.1 Schema (SQLite)

```sql
CREATE TABLE recipes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  ingredients     TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  steps           TEXT NOT NULL DEFAULT '[]',   -- JSON array of strings
  notes           TEXT NOT NULL DEFAULT '',
  source_url      TEXT NOT NULL DEFAULT '',
  image_filename  TEXT,                          -- relative to /data/images/ or NULL
  rating          INTEGER NOT NULL DEFAULT 0,    -- 0 = unrated, 1-5 otherwise
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT                            -- NULL = active; set = soft-deleted
);

CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_deleted_at ON recipes(deleted_at);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE recipe_tags (
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  PRIMARY KEY (recipe_id, tag_id)
);

CREATE VIRTUAL TABLE recipes_fts USING fts5(
  title,
  ingredients,
  steps,
  description UNINDEXED,
  content='recipes',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'   -- diacritic-insensitive: 'tarte' matches 'tarte' and 'târté'
);

-- Triggers keep FTS in sync with the recipes table
CREATE TRIGGER recipes_ai AFTER INSERT ON recipes BEGIN
  INSERT INTO recipes_fts(rowid, title, ingredients, steps, description)
  VALUES (new.id, new.title, new.ingredients, new.steps, new.description);
END;
CREATE TRIGGER recipes_ad AFTER DELETE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, ingredients, steps, description)
  VALUES ('delete', old.id, old.title, old.ingredients, old.steps, old.description);
END;
CREATE TRIGGER recipes_au AFTER UPDATE ON recipes BEGIN
  INSERT INTO recipes_fts(recipes_fts, rowid, title, ingredients, steps, description)
  VALUES ('delete', old.id, old.title, old.ingredients, old.steps, old.description);
  INSERT INTO recipes_fts(rowid, title, ingredients, steps, description)
  VALUES (new.id, new.title, new.ingredients, new.steps, new.description);
END;
```

### 3.2 Why these choices

- **Ingredients and steps as JSON `TEXT[]`** instead of child tables: locks simplicity per the user's choice ("plain strings"). Lists are read and written atomically as a whole; no need to address individual rows. SQLite doesn't have a native ARRAY type but `json_array` is fine and indexed as opaque text (FTS re-extracts on update).
- **FTS5 with `unicode61 remove_diacritics 2`**: makes `râcle` match `racle`. Critical for French ingredient terms. The `content=` external-content pattern keeps the FTS index in sync without data duplication.
- **Tags normalized and `COLLATE NOCASE`**: `dessert` and `Dessert` are the same tag. Autocomplete uses `SELECT name FROM tags WHERE name LIKE ?  COLLATE NOCASE`.
- **Soft delete**: `deleted_at TEXT NULL` lets the undo toast restore via a single column update; no foreign-key cascade that would lose tag associations.
- **No `users` table**: there's no per-user concept. Auth is app-wide.
- **No `ingredients`/`steps` foreign-key child tables**: avoids the complexity of partial-list edits for what's effectively list-of-string fields.

### 3.3 Filesystem layout

```
/data/
  recipes.db          # SQLite database
  images/             # image files; recipe.image_filename is relative to this
    <uuid>.jpg
    <uuid>.png
  auth/               # (none — password is in env)
```

The `/data` directory is mounted as a Docker named volume. Snapshotting it after `VACUUM INTO` is enough for a clean backup.

---

## 4 · Architecture & components

### 4.1 Module layout

```
src/
  server.ts                   # entrypoint: Hono app, binds 0.0.0.0:$PORT
  config.ts                   # env reading; refuses to boot if APP_PASSWORD is empty
  db/
    schema.sql                # schema used at first-run
    migrate.ts                # idempotent: applies schema.sql if missing tables
    connection.ts             # opens sqlite DB with pragmas (WAL, foreign_keys)
  auth/
    middleware.ts             # gates every route except /login; sets ctx.user = 'family'
    routes.ts                 # GET /login, POST /login, POST /logout
    session.ts                # signed cookie via Web Crypto HMAC SHA-256
  recipes/
    routes.ts                 # GET /recipes (library), /recipes/:id (view), /recipes/:id/edit etc.
    repository.ts             # CRUD SQL; soft-delete; undo; tag/save/replace
    search.ts                 # FTS5 query builder, tag-join filtering
    forms.ts                  # validation: title non-empty on save, etc.
  import/
    routes.ts                 # POST /recipes/import (URL); POST /recipes/import/html (paste);
                              # POST /recipes/import/file (file upload, JSON-LD or our own)
    fetcher.ts                # fetch(url, headers) with browser-like UA, 5 MB cap, 30 s timeout
    extractor.ts              # orchestrates Layer 1 -> Layer 2 -> Layer 3
    extractors/
      recipe-scrapers.ts      # wraps the TS `recipe-scrapers` library
      readability.ts          # @mozilla/readability fallback
    file-importers/           # adapters for upload-based import (§16)
      json-ld.ts               # parses any JSON-LD Recipe document (Recipe Manager's own export
                              # and RecipeSage's export share this format)
      normalize.ts             # title normalization for duplicate detection (NFKC + lowercase +
                              # whitespace-collapse + punctuation-strip)
    image.ts                   # downloads image binary to /data/images/<uuid>.<ext>
  tags/
    routes.ts                 # GET /tags/autocomplete?q=... (HTMX chip source)
    repository.ts             # list all (with counts), create-or-find-by-name
  settings/
    routes.ts                 # GET /settings (data in/out page)
  export/
    routes.ts                 # GET /export/formats/<format> for pdf | md-zip | json-ld-zip
    markdown.ts               # renders each recipe to .md with YAML frontmatter; zip all
    jsonld.ts                 # emits one .jsonld file per recipe OR a single combined .json array;
                              # uses schema.org Recipe schema, includes our tags as keywords
    pdf.ts                    # pdfkit-based rendering: A4, image at top, content flows down
  pwa/
    manifest.ts               # serves /manifest.webmanifest with share_target entry
    sw.ts                     # serves /sw.js — service worker that caches the app shell only
                              # and intercepts POST from share_target (redirect to /import/shared)
  ui/
    templates/                # Nunjucks templates
      library.html
      recipe-view.html
      recipe-edit.html
      login.html
      import.html              # URL import form (existing)
      settings.html            # data in/out page (§18)
      partials/                # header, tag chip sidebar, recipe card, share-target result, etc.
    css/
      app.tailwind.css         # Tailwind v4 entry; @import tokens via CSS @theme
    static/
      app.css                  # compiled output, served from /static/app.css
      htmx.min.js              # served from /static/htmx.min.js
      icons/                   # PWA icons 192px + 512px + maskable variants
      manifest.webmanifest     # static fallback; usually built per-request with share_target
  runtipi/
    app.json                  # Runtipi manifest
    docker-compose.yml        # Runtipi-compatible compose
    config.json              # exposed env vars for Runtipi UI (APP_PASSWORD)
  Dockerfile
  package.json
  tsconfig.json
```

### 4.2 Component responsibilities

**`db/connection.ts`** — opens SQLite, sets `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`. WAL is critical for the import path (multiple writes) without blocking reads.

**`auth/session.ts`** — `createSessionCookie()` returns a cookie containing a signed payload (`{exp: epoch}` signed with `APP_PASSWORD` as the HMAC key). `verifySessionCookie()` checks signature and `exp`. 30-day expiry, `HttpOnly`, `SameSite=Lax`, `Secure` set when behind `X-Forwarded-Proto: https`.

**`import/extractor.ts`** — the heart of the URL import flow. Pure function:

```ts
type ImportOutcome =
  | { kind: 'structured'; recipe: PartialRecipe }     // Layer 1 success
  | { kind: 'readability'; recipe: PartialRecipe; rawText: string }  // Layer 2
  | { kind: 'unsupported'; reason: string }             // Layer 3

async function extractRecipe(url: string, html: string): Promise<ImportOutcome>
```

The route handler decides what to do with each outcome (see §5).

**`import/fetcher.ts`** — single `fetch` call with browser-like headers. Returns `{ status, html, finalUrl }`. On non-2xx, returns `null` and the route falls through to manual paste.

**`tags/repository.ts`** — the `replaceTagsForRecipe(recipeId, names[])` function: deletes existing `recipe_tags` rows, `INSERT OR IGNORE`-s each name into `tags`, joins into `recipe_tags`. Runs in a single SQLite transaction.

**`export/markdown.ts`** — for each recipe, emit:
```
---
title: Classic Tiramisu
source_url: https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx
rating: 5
tags: [dessert, italian]
created_at: 2026-07-13T14:00:00Z
---

## Description
...

## Ingredients
- 200g flour
- 3 eggs

## Steps
1. ...

## Notes
...

![image](images/abc123.jpg)
```
Zipped alongside the `images/` directory.

### 4.3 Request lifecycle

1. Hono receives request.
2. `auth.middleware.ts` checks the `session` cookie. If absent or invalid and the path is not `/login`, redirect to `/login`.
3. Route handler runs SQL via `db/connection.ts` (single shared `Database` instance), renders a Nunjucks template, returns HTML.
4. On the library page (`/recipes`), the HTMX attributes on the search input and tag chips issue `GET /recipes?...` returning just the grid HTML partial; HTMX swaps it in.

---

## 5 · Import flow (end-to-end)

The user clicks "+ Import URL" on the library page → a dedicated import page (`GET /import`) opens with a single URL input field. They paste a URL, submit `POST /recipes/import` with `{ url }`. (The library header's "+ Import" button is a plain link to `/import`, not a modal — keeps the JS footprint minimal.)

**Step 1 — Fetch & extract**

```
1. fetcher.fetch(url, browserHeaders)
   ├── 2xx + body < 5 MB -> extractor.extractRecipe(url, html)
   │     ├── Layer 1: recipe-scrapers scrapeRecipe(html, url, {safeParse: true})
   │     │     ├── success + minimum fields (title non-empty + at least ingredients or steps)
   │     │     │     -> image.download(imageUrl) (best-effort, async-after-redirect)
   │     │     │     -> recipes.insert({ title, description, ingredients, steps, source_url: url, image_filename })
   │     │     │     -> redirect to /recipes/:id/edit
   │     │     ├── success but partial (missing one of ingredients/steps)
   │     │     │     -> save what we got, redirect to /recipes/:id/edit with a banner
   │     │     │        "Imported with gaps; please complete"
   │     │     └── failure (extractor_not_found / extraction_failed)
   │     │         -> fall to Layer 2
   │     ├── Layer 2: readability fallback
   │     │     -> @mozilla/readability returns { title, content (HTML), textContent, excerpt }
   │     │     -> recipes.insert({ title: readable.title, description: readable.excerpt,
   │     │                           steps: [readable.textContent], source_url: url })
   │     │     -> download og:image if present (best-effort)
   │     │     -> redirect to /recipes/:id/edit with banner "Imported as raw text; clean up"
   │     └── Layer 3: nothing extractable
   │           -> recipes.insert({ source_url: url })  # row with empty title
   │           -> redirect to /recipes/:id/edit in 'manual paste' mode
   │              (edit page shows: URL link, 'Open in new tab' + iframe to source URL,
   │               empty fields ready to type into)
   └── non-2xx / blocked / empty body
         -> recipes.insert({ source_url: url })  # draft row
         -> redirect to /recipes/:id/edit with mode='paste_html'
            (edit page shows: URL field at top, big textarea labeled
            'Paste page source (Ctrl+U, copy, paste) from <url>' + a submit button)
            on submit POST /recipes/import/html with { recipe_id, html }
              -> runs extractor.extractRecipe(url, html) again
              -> success: recipe updated, redirect to /recipes/:id/edit (normal)
              -> failure: stays in paste mode, shows error
```

**Critical design choices:**

- **Always save, never reject.** Whatever we get, including just a URL, becomes a row. Reviewing and editing partial data is always easier than re-doing import from scratch.
- **Always redirect to the edit page** after import. The user locked this in explicitly: don't show a "view draft" intermediate.
- **Discard raw HTML** after extraction. Don't store it; `source_url` is enough provenance and keeps the DB small.
- **Image download is fire-and-forget.** The user shouldn't wait on a 2 MB image fetch to start editing. The recipe saves with `image_filename = NULL`; a background coroutine writes the file and updates the column when done. If it fails, the card shows the "no image" placeholder.
- **Paste-HTML mode** is the no-dependency answer to bot-blocked sites. The user Ctrl+U in their own browser (Cloudflare lets the real browser through), copies, pastes into our textarea. Our extractor runs on the same HTML the browser saw, so it works.

---

## 6 · Auth

- **Setup:** `APP_PASSWORD` is mandatory. `config.ts` runs at server start; if `APP_PASSWORD` is unset or empty, it `console.error`s a clear message and `process.exit(1)`. Runtipi exposes this via `config.json` so the user sets it in their Runtipi UI.
- **Login form:** `GET /login` renders a single-password form. `POST /login { password }` confirms via constant-time compare (`crypto.timingSafeEqual`), sets the session cookie, redirects to `/recipes`.
- **Session cookie:** signed with HMAC-SHA-256 over `{exp: <30 days>}` using `SESSION_SECRET` (env var, defaulting to `APP_PASSWORD` if unset) as key. No session table — no DB touch on every request. (The `SESSION_SECRET` env var in `app.json` is optional; if left blank the server falls back to `APP_PASSWORD`. This is exposed as a design hook for later — v1 uses `APP_PASSWORD` and the optional `SESSION_SECRET` is just an inheritable env slot.)
- **Logout:** `POST /logout` clears the cookie.
- **Middleware:** every route other than `/login` and `/static/*` requires a valid cookie; otherwise redirects to `/login`.
- **Cookie attributes:** `HttpOnly`, `SameSite=Lax`, `Secure` (when behind HTTPS, detected via `X-Forwarded-Proto`), `Path=/`, `Max-Age=2592000`.

---

## 7 · UI design

### 7.1 Theme

**Neutral minimalist with a dark/light toggle.** Based on the mockup at `.mockups/theme-neutral-minimalist.html` (in the project) — open it in a browser.

Light tokens:
```
--bg:         #f8f8f7
--surface:    #ffffff
--text:       #1a1a1a
--muted:      #888
--accent:     #5a7a4f   (sage)
--border:     #e0e0de
--radius:     4px
```

Dark tokens (default in `prefers-color-scheme: dark` OR when the user toggles):
```
--bg:         #1a1a1c
--surface:    #242427
--text:       #e8e8e6
--muted:      #8a8a8a
--accent:     #94b386   (lighter sage)
--border:     #2e2e32
```

**Toggle:** a small ☀/🌙 icon in the header. Toggling sets a `theme=light|dark|auto` cookie; the server-side template reads it and adds `class="dark"` to `<html>` if needed. `auto` uses `prefers-color-scheme`. Default value: `auto`.

### 7.2 Pages

- **`GET /login`** — single password field, centered.
- **`GET /recipes`** (the home/library page):
  - Top header: logo (text "recipes"), centered search bar with placeholder "Search recipes, ingredients, steps...", import button (top right), theme toggle icon.
  - Below the header: two-column layout.
    - Left sidebar: "Tags" subsection with chip list (all / dessert / italian / ... / each chip has a count badge). Clicking a chip sets `?tag=` and HTMX-swaps the grid.
    - "Source" subsection with chips per source domain (marmiton.org / 750g.com / ...).
    - Main: a responsive grid of recipe cards (auto-fill, minmax(220px, 1fr)).
  - HTMX: `hx-get="/recipes?..."` with `hx-target="#grid"` and `hx-trigger="input changed delay:200ms, click"` on the search input and chip container. Server returns only the grid partial when the request has `HX-Request: true`.
- **`GET /recipes/:id`** (the cook view):
  - Centered header: recipe image (centered, max 600px), title, rating stars, description.
  - Below header: two-column body.
    - Left column: "Ingredients" heading + bulleted list. Each ingredient has a checkbox the user can tick while cooking (CSS only, no server state).
    - Right column: "Steps" heading + numbered list.
  - Below the two columns (full width): "Notes" field render.
  - Footer of the page: source URL with "Original ↗" link, an Edit button, a Delete button, and a Print button.
- **`GET /recipes/:id/edit`**:
  - Top: a small preview of title + image.
  - Form fields: title (input), description (textarea), ingredients (textarea, one per line — converted to/from JSON array), steps (textarea, one per line), rating (5-radio or star widget), tags (chips input with autocomplete via `GET /tags/autocomplete?q=...&recipe=:id`), image (current preview + file input + "or paste an image here" instruction), source URL (input), notes (textarea).
  - When the recipe was imported as draft (Layer 3 / paste mode), a banner is shown at top with one of:
    - "Imported with gaps; please complete"
    - "Imported as raw text; clean up"
    - "URL fetch failed; paste the page's HTML to retry extraction" + a big textarea + a "Retry extraction" submit button
    - "Manual mode: open the original in a new tab and paste what you want here" + an embedded iframe `<iframe src="source_url">` on the side (only if the source allows iframe embedding; otherwise a link)
  - Save/Cancel buttons at the bottom. Save submits `POST /recipes/:id` (form-encoded or multipart when an image file is attached).
- **`GET /settings`** — the data in/out page (see §18). Two sections:
  - **Export** — three download buttons:
    - "Export PDF" → `GET /export/formats/pdf` (single A4 PDF, one recipe per page break group, image at top, see §15.1)
    - "Export Markdown zip" → `GET /export/formats/md-zip` (existing, see §15.2)
    - "Export JSON-LD zip" → `GET /export/formats/json-ld-zip` (one `.jsonld` per recipe, see §15.3)
  - **Import from file** — file upload form:
    - One file input accepting `.json`, `.jsonld`, `.zip` (zipped JSON-LD or Markdown).
    - On submit, server:
      1. Auto-detects format (JSON-LD vs this app's Markdown zip — see §16.3)
      2. Parses into a list of `PartialRecipe`
      3. Runs duplicate detection (see §16.2)
      4. Renders a preview page showing NEW recipes (will be added) and DUPLICATES (skip / replace toggle, default skip)
      5. User confirms → recipes written, redirect to library with a "Imported N new, skipped M" banner.
  - Group RPC actions: button-based (not modal) to avoid JS state. The preview is its own page at `/settings/import/preview`.

Original library-header export button is removed; library header now only has "+ Import" and the theme toggle. **Settings** is reachable via a small gear icon in the header.

---

## 8 · Search & filtering

### 8.1 FTS5 query

The search box posts to `GET /recipes?q=<query>&tag=<tag>&source=<domain>`.

If `q` is non-empty, the query is:
```sql
SELECT r.* FROM recipes r
WHERE r.deleted_at IS NULL
  AND r.id IN (SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH :query)
ORDER BY rank
LIMIT 500;
```

`query` is sanitized via SQLite FTS5 query syntax — we use the `prefix` token for partial matches: `pasta` becomes `"pasta"*`. Si special characters are present, wrap as a quoted phrase.

If only `tag` is set:
```sql
SELECT r.* FROM recipes r
JOIN recipe_tags rt ON rt.recipe_id = r.id
JOIN tags t ON t.id = rt.tag_id
WHERE r.deleted_at IS NULL
  AND t.name = :tag COLLATE NOCASE
ORDER BY r.created_at DESC;
```

If both: combine with `AND rowid IN (...)`.

If neither: `SELECT * FROM recipes WHERE deleted_at IS NULL ORDER BY created_at DESC`.

### 8.2 Tag chips data

`GET /tags/autocomplete?q=...` returns `<li>` chips HTMX-fragment for the tag input. `GET /tags` (called at library page render) returns all tags with counts for the sidebar:
```sql
SELECT t.name, COUNT(rt.recipe_id) AS cnt
FROM tags t
LEFT JOIN recipe_tags rt ON rt.tag_id = t.id
LEFT JOIN recipes r ON r.id = rt.recipe_id AND r.deleted_at IS NULL
GROUP BY t.id
ORDER BY cnt DESC, t.name COLLATE NOCASE;
```

---

## 9 · Error handling & failure modes

- **Fetch fails (network/DNS):** save as draft, edit page shows "URL fetch failed. Open the original in a new tab and paste, or use paste-HTML mode."
- **recipe-scrapers returns extraction_failed:** fall through to Layer 2.
- **readability returns nothing useful:** fall through to Layer 3 manual.
- **Image download fails:** set `image_filename = NULL`; the library card and edit page show the "no image" placeholder. The recipe is still saved.
- **Image upload is too large (>8 MB) or wrong type:** form reject with a clear message. Allowed: jpeg, png, webp. Stored with its original extension; renamed to `<uuid>.<ext>`.
- **DB disk full (SQLite.BusyError / disk I/O error):** server returns HTTP 500 with "Server error — please check your disk space." and logs.
- **APP_PASSWORD unset:** server does not start. Clear log line.
- **Cookie tampering:** bad signature → no session → redirect to /login. No error message needed.
- **Soft-delete undo window expired:** undo toast disappears after 10 seconds; toast's "Undo" button hits `POST /recipes/:id/restore`; once it expires, recipe stays soft-deleted. User can still restore from a backup if needed; no in-app UI for "view deleted."

---

## 10 · Testing

Three test tiers:

1. **Unit tests** (Bun's built-in `bun test`) — pure functions in `extractor.ts`, `search.ts`, `tags/repository.ts`, `auth/session.ts`, `export/markdown.ts`. Real SQLite via `:memory:` for repo tests.
2. **HTTP integration tests** — Spin up the Hono app in-process with a `:memory:` DB; use Bun's native fetch. Cover the import flow end-to-end with a stubbed `fetcher` that returns pre-recorded HTML (already in this repo: the four `.html` test fixtures used during library evaluation at `tests/fixtures/*.html`), the login flow, soft-delete + undo, search, tag autocomplete.
3. **End-to-end import smoke test** — a single test that loads the four offline HTML fixtures (allrecipes, bbcgoodfood, marmiton, 750g) saved during the evaluation phase and asserts that `extractor.extractRecipe(url, html)` produces non-empty `title` and `ingredients` for each one. Catches regressions if `recipe-scrapers` upgrades change the contract.

**Lint / typecheck:** Biome for lint and `bun x tsc --noEmit` for typecheck. Both run in CI (GitHub Actions) and locally via `bun run check`.

---

## 11 · Deployment (Runtipi packaging)

### 11.1 Docker image

`Dockerfile` (multi-stage):
- Stage 1 (`oven/bun:1-debian`): `bun install --frozen-lockfile --production`, `bun build src/server.ts --target bun --outdir dist`.
- Stage 2 (`oven/bun:1-debian`, slimmer): copy only `dist/server.js`, `db/schema.sql`, `ui/templates`, `ui/static`, `package.json`. `CMD ["bun", "dist/server.js"]`.
- Final image size: ~180 MB. Container idle RSS: 40-80 MB.

### 11.2 Runtipi app.toml & docker-compose

`runtipi/app.json` (Runtipi v2 format, fields defined in your existing app store for reference):
```json
{
  "$schema": "https://store.runtipi.io/schema/v1.json",
  "id": "recipe-manager",
  "version": "1.0.0",
  "category": "food",
  "name": "Recipe Manager",
  "tagline": "Self-hosted recipe library with URL import",
  "description": "...",
  "author": "you",
  "source": "https://github.com/you/recipe-manager",
  "image": "ghcr.io/you/recipe-manager:1.0.0",
  "port": 3000,
  "exposable": true,
  "form_fields": [
    {
      "type": "password",
      "label": "App password",
      "required": true,
      "env_variable": "APP_PASSWORD"
    },
    {
      "type": "choice",
      "label": "Session secret (auto-generated if blank)",
      "required": false,
      "env_variable": "SESSION_SECRET",
      "options": []
    }
  ],
  "supported_architectures": ["linux/amd64", "linux/arm64"]
}
```

(Runtipi auto-handles the `tipiapp_network_common` external network, the reverse proxy routing, and the persistent `data` directory under `app-data/recipe-manager/data`.)

`runtipi/docker-compose.yml`:
```yaml
services:
  recipe-manager:
    image: ghcr.io/you/recipe-manager:1.0.0
    container_name: recipe-manager
    restart: unless-stopped
    environment:
      - APP_PASSWORD=${APP_PASSWORD}
      - SESSION_SECRET=${SESSION_SECRET:-}
    volumes:
      - ${APP_DATA_DIR}/data:/data
    ports:
      - ${APP_PORT}:3000
```

### 11.3 CI/CD

`.github/workflows/release.yml`:
- On tag `v*.*.*`: build image (multi-arch via `docker buildx`), push to GHCR with both `:latest` and `:1.x.x` tags, update `runtipi/app.json` `version` and `image` fields in a `release-please` commit.

---

## 12 · Future-proofing hooks (no v1 implementation)

These are explicitly **not** built in v1, but interfaces are reserved.

- **`import/extractors/` directory.** Adding a new extractor (e.g., an LLM extractor) means adding a new file and registering it. Pure-function contract defined by `extractor.extractRecipe(url, html)`.
- **`import/file-importers/` directory.** Same shape. Adding Paprika / CopyMeThat / Evernote / etc. support later means adding a new adapter to this directory (see §16.4 contract).
- **`SESSION_SECRET` env var.** Currently reused as `APP_PASSWORD`. If you later separate the auth password from the cookie-signing key, the env hook is already there.
- **Per-recipe export (`GET /recipes/:id.md`)** — easy to add; v1 only has the bulk exports.

---

## 13 · PWA & installability

### 13.1 Manifest

Served at `/manifest.webmanifest` (each request, so the `share_target` entry can reference the user's own base URL — actually, paths are relative so a static file is fine and we use `static/manifest.webmanifest`).

Minimal preamble — backend-enforced login means `start_url: "/recipes"`, `scope: "/"`, `display: "standalone"`, `orientation: "portrait"` (recipe browsing is portrait-friendly; edit page allows rotation). `background_color: "#f8f8f7"`, `theme_color: "#5a7a4f"` matching §7.1 light mode. Icons: 192px and 512px PNG, plus a `purpose: "maskable"` 512px variant for Android adaptive icons.

Icons live at `/static/icons/` and are embedded as base64 in the manifest (small enough) or served as separate files. v1: separate files (simpler and cacheable).

### 13.2 Service worker (`/static/sw.js`)

A single file under 30 lines. Responsibilities:

1. **Install**: pre-cache the app shell — `/static/app.css`, `/static/htmx.min.js`, `/static/icons/`, `/manifest.webmanifest`, `/login` (HTML). Skip if any fetch fails (don't break install on a transient network error).
2. **Activate**: clear old cache versions.
3. **Fetch handler** — three branches:
   - Same-origin GET for a cached shell asset → **cache-first** (instant load offline).
   - Same-origin POST to `/shared-target` (from Web Share Target — see §14) → handle locally, redirect to `/import/shared?url=...`, never hit network. The share target is what makes the "tap and you're in the app" flow work offline.
   - Everything else (HTML page renders, AJAX data, image, etc.) → **network-only**. If network fails, return a 503 with a small "Cannot reach server" placeholder so the user sees a clear error, not a browser-native "no internet" page.

There is **no offline library cache**. Recipe data is always fetched live from the homelab. The user locked this in (§13 → app shell only).

### 13.3 Install

No install prompt library. Chrome Android shows its own "Install app" prompt after the installability criteria are met (manifest + icons + registered service worker + HTTPS via Runtipi). The user adds to home screen via Chrome's menu. The library's settings page has a small hint "Install this app: tap your browser menu → Add to Home screen" — text only, no `beforeinstallprompt` interception.

### 13.4 Login session on Android

Cookie is set with `SameSite=Lax` per §6. When the share_target POST lands (cross-origin from the Android share sheet), the service-worker intercept **does not pass cookies** (Lax cookies are withheld on cross-site POSTs in modern Chrome). Mitigation: the share target POST is treated as a fresh anonymous request; the sw responds with a `303 See Other` to `/import/shared?url=...` (a GET navigation), which becomes a same-origin top-level navigation carrying `SameSite=Lax` cookies as normal. If the session cookie is missing (logged out), the auth middleware redirects to `/login?return=/import/shared?url=...`; after login, the user lands on the import-shared flow. This is the simplest correct flow.

---

## 14 · Web Share Target (Android only)

The user is in Chrome viewing a recipe on `marmiton.org`. Tap "Share" → "Recipe Manager" from the share sheet. The PWA launches with the URL pre-armed; import auto-extracts and lands on the edit page (per the user's locked decision).

### 14.1 Manifest entry

```json
{
  "share_target": {
    "action": "/shared-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

The shared URL arrives as the `url` form field (`title` and `text` ignored on the server — we only consume `url`).

### 14.2 Service worker intercept

```js
// inside sw.js fetch handler, before the network-only branch
if (event.request.method === 'POST' && url.pathname === '/shared-target') {
  event.respondWith((async () => {
    const formData = await event.request.formData();
    const link = formData.get('url') || '';
    return Response.redirect(`/import/shared?url=${encodeURIComponent(link)}`, 303);
  })());
  return;
}
```

The 303 redirect converts the cross-origin POST into a same-origin GET navigation, fixing cookie gates (see §13.4).

### 14.3 Server endpoint `GET /import/shared?url=...`

Authenticated route. It runs the **exact same** import flow as `POST /recipes/import` (§5): fetch → Layer 1 → Layer 2 → Layer 3 → save → redirect to `/recipes/:id/edit`. Code reuse `import/extractor.ts`; the only difference is the entry URL.

Banner on the resulting edit page: "Imported from share" + a "View library" link.

If the user is not logged in: auth middleware redirects to `/login?return=encodeURIComponent('/import/shared?url=' + originalUrl)`. After login, the user lands on the same import flow.

If the shared `url` is empty / not a valid URL: render a small error page "No URL was shared" with a link to the library.

---

## 15 · Multi-format export

All exports behind `GET /export/formats/<format>` where `<format>` ∈ `{ pdf, md-zip, json-ld-zip }`. Auth-gated. All export non-deleted recipes only (excludes soft-deleted rows). Each format returns a single downloadable file (binary stream — no `/data` writes for export, no buffering the whole file in memory).

### 15.1 PDF

- Library: `pdfkit` (no native deps, no Chromium, streams output).
- Page: A4 portrait, ~1.5 cm margins.
- One recipe per page-break group: top of each recipe starts on a new page (`doc.addPage()`); content (image + title + meta + ingredients + steps + notes) flows naturally; very long recipes spill onto the next page.
- Layout per recipe:
  - Image at top, max 12 cm tall, centered (`object-fit: cover`-equivalent — pdfkit handles via `doc.image(path, { width, height, align: 'center' })` after computing scaled dimensions).
  - Title (16pt bold) below image.
  - Meta line (`recipe_count` rating as ★ symbols, source URL).
  - Two-column block below: ingredients (left ~7 cm) and steps (right). If columns don't fit on the remaining page, steps flow to the next page proper (no awkward split-half-across-page).
  - Notes at the bottom if non-empty.
- No cover page, no TOC. Just recipe pages in created_at order.
- Filename: `recipes-YYYY-MM-DD.pdf`.
- Memory: pdfkit streams to the response writer. Peak ~30 MB during export; well within the 4 GB budget.

Images that are missing on disk (file deleted from /data but row still has filename): skip the image, render a small "no image" box in its slot.

### 15.2 Markdown zip

Already in the original spec (§4.2 `export/markdown.ts`). One `.md` per recipe with YAML frontmatter (`title`, `source_url`, `rating`, `tags`, `created_at`), body sections, embedded `images/<filename>.jpg`. Zipped with `archiver`. Filename: `recipes-YYYY-MM-DD.md.zip`.

### 15.3 JSON-LD zip

One `.jsonld` file per recipe, plus a `manifest.json` listing all generated files. Each `.jsonld` is a single schema.org Recipe object:

```json
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "Classic Tiramisu",
  "description": "...",
  "image": "images/<filename>.jpg",
  "recipeIngredient": ["200g flour", "3 eggs", ...],
  "recipeInstructions": ["Step 1...", "Step 2...", ...],
  "recipeCategory": "",
  "keywords": "dessert,italian",
  "recipeYield": "",
  "nutrition": {},
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "5",
    "ratingCount": "1"
  },
  "Notes": "..."  // Not standard; we'd put this in `description` tail or omit. For v1 we put notes in a custom `x-recipe-manager-notes` extension field so round-trip preserves them.
}
```

Image files live alongside the JSON-LD files in an `images/` subdirectory inside the zip (same path referenced by `image` URLs in the JSON). Round-trip: re-importing our own export zip re-populates `image_filename` by downloading from the `file://`-aliased `images/` directory in the zip. v1 simplification: store images as separate files in the zip and re-import via the same multipart upload mechanism that handles "bulk image directory" — i.e., the importer accepts a zip, extracts to a temp dir, processes each `.jsonld`, and copies the referenced image file to `/data/images/`.

Filename: `recipes-YYYY-MM-DD.jsonld.zip`.

### 15.4 Non-goals for v1

- No single-page "Export to PDF" for an individual recipe from the recipe detail page (use the bulk PDF and search/filter to narrow).
- No CSV export.
- No plain-`.md`-single-file export (the markdown zip covers portability).

---

## 16 · Multi-source file import (from local file)

User uploads a file via `/settings` Import section. We support two file shapes:

1. **Single .json or .jsonld file** — one Recipe JSON-LD object, or an array of them.
2. **Zip file** — either:
   - JSON-LD zip we exported (`*.jsonld.zip` with a `manifest.json`) — read each `.jsonld` and the corresponding `images/<filename>.jpg`.
   - Markdown zip we exported (`*.md.zip`) — parse each `.md`'s frontmatter and body.
   - RecipeSage's exported format (JSON-LD; possibly single file or array; image URLs are external, not bundled).

**Format detection** (see §16.3):
- `.json` or `.jsonld` extension → parse as JSON; if it's an array → multi-recipe; else treat as single.
- `.zip` extension → unzip to temp dir; look for `manifest.json`:
  - If `manifest.json` lists `.md` files → Markdown zip importer.
  - If it lists `.jsonld` files → JSON-LD zip importer.
  - Else: glob for `*.jsonld`, `*.json`, `*.md` at the top of the zip and dispatch.
- Anything else: error "Unsupported file type".

### 16.1 Field mapping (JSON-LD → our schema)

| Our field | JSON-LD source | Notes |
|---|---|---|
| `title` | `name` | Strip HTML if present. |
| `description` | `description` | String only (schema.org allows Text). |
| `ingredients[]` | `recipeIngredient` | Array of strings. Strip HTML. |
| `steps[]` | `recipeInstructions` | If array of `HowToStep` objects → take each `.text`. If array of strings → as-is. Strip HTML. |
| `image_filename` | `image` | URL string. If it's a relative path (our own export round-trip), copy from temp dir; if absolute URL, download to `/data/images/`. |
| `source_url` | `@id` (if URL) or empty | For RecipeSage export, their JSON-LD may omit `@id`; in that case `source_url = ''`. We never use the file's filesystem path as source. |
| `tags[]` | `keywords` | If a string, split on comma; trim each; lowercase ONLY if needed for our `COLLATE NOCASE` (already handles case). |
| `notes` | `x-recipe-manager-notes` (our extension) | Empty if absent. |
| `rating` | `aggregateRating.ratingValue` | Integer 1-5; if non-numeric or empty, set 0. |

**HTML stripping**: RecipeSage allows rich text (bold/italic/tables) in ingredients/instructions. We strip all HTML tags on import into plain strings. This loses formatting but is consistent with our v1 plain-string schema. Final note: we use a small sanitizer (`sanitize-html`'s minimal config or a regex for `<[^>]+>` after parsing; the latter is risky if HTML entities are present). v1: parse with a DOMParser (browser-side or `linkedom` on the server), then `.textContent`. Mark as a known limitation in the import preview page.

### 16.2 Duplicate detection

For each imported `PartialRecipe`:

1. **Normalize title**: NFKC Unicode normalize → lowercase → collapse whitespace → strip leading/trailing punctuation. Keep diacritics (e.g., `tarte` ≠ `târté`) because the FTS `remove_diacritics 2` flag is for search matches, not identity matches.
2. **Find candidate existing recipes**:
   - If `source_url` is non-empty on the import AND on an existing recipe — match if `source_url` are identical (exact match, no normalization — URLs are picky about case/path).
   - Else match if normalized title + (first 30 chars of first ingredient, or empty) are identical.
3. **Outcome per row**: `{ status: 'new' }` or `{ status: 'duplicate', existing_id, similarity_reason }`.

Preview page lists them with checkboxes:
- New recipes: shown with title + brief meta, checked by default (will be imported).
- Duplicates: shown with "Existing: XYZ" link + radio: Skip (default) / Replace.
- Replace = update existing recipe's fields; preserves the row id and the existing image (unless the import brings a new image, in which case the new image replaces the old; the old file is deleted from /data/images/).

User clicks "Confirm Import" → server writes:
1. INSERT all NEW rows in a single transaction. Tag associations atomically created via `tags/repository.replaceTagsForRecipe` per row.
2. For each REPLACE: UPDATE the existing row; drop and re-create tag associations.
3. Redirect to library with toast "Imported <N> new, replaced <M>".

### 16.3 Image handling on import

- If the imported JSON-LD has an `image` field that is a **relative path** (our own export): copy from the extracted temp dir to `/data/images/<uuid>.<ext>`, generating a fresh `uuid` to avoid collisions.
- If the `image` field is an **absolute URL** (RecipeSage export): download via `import/image.ts` (same path as URL-import downloads), with the same 5 MB cap and 30 s timeout.
- If the `image` field is missing: `image_filename = NULL`.
- If an image download fails: leave `image_filename = NULL` and proceed — do not fail the whole import.

### 16.4 Adapter interface (for future formats)

```ts
// in src/import/file-importers/adapter.ts
export interface FileImportAdapter {
  /** Detects whether this adapter can handle the uploaded file */
  matches(file: { name: string; mime: string; firstBytes: Uint8Array }): boolean;
  /** Parses the file into a list of candidate recipes */
  parse(buffer: Uint8Array, opts: { tempDir: string }): Promise<PartialRecipe[]>;
}
```

v1 ships two adapters: `JsonLdAdapter` (handles `.json`, `.jsonld`, and our own `.jsonld.zip`) and `MarkdownZipAdapter` (handles our own `.md.zip`). Adding Paprika / CopyMeThat later is a new file implementing this interface and a registration in `src/import/file-importers/index.ts`.

---

## 17 · Settings page

`GET /settings` — auth-gated, no JS framework. Two-column layout (collapses to one on mobile):

**Left column — Export**

```
EXPORT
─────────────────────────────────────────
[ Export as PDF (A4)        ] →  GET /export/formats/pdf
[ Export as Markdown zip    ] →  GET /export/formats/md-zip
[ Export as JSON-LD zip     ] →  GET /export/formats/json-ld-zip
```

Each button is a plain `<a href download>` link (browser handles download natively, JS not needed).

**Right column — Import from file**

```
IMPORT FROM FILE
─────────────────────────────────────────
<form action="/settings/import/preview" method="post" enctype="multipart/form-data">
  <input type="file" name="file" accept=".json,.jsonld,.zip">
  <button>Preview import</button>
</form>
<p class="hint">Accepts: JSON-LD (.json/.jsonld) or a zip of either JSON-LD files or Markdown files.
RecipeSage exports are supported.</p>
```

After submit → server detects format, parses, runs duplicate detection, returns `/settings/import/preview` page:

```
PREVIEW IMPORT — file_recipes_2026-07-13.zip
─────────────────────────────────────────
3 new recipes (will be added):
  ☑ Classic Tiramisu            | no source_url
  ☑ Spaghetti Bolognese         | bbcgoodfood.com
  ☑ Soupe à l'Oignon            | 750g.com
2 duplicates (won't import unless you choose Replace):
  ⦿ Skip   ○ Replace   | matches "Tarte Tatin" (id 14)
  ⦿ Skip   ○ Replace   | matches "Pasta al Pomodoro" (id 27)
<form action="/settings/import/commit" method="post">
  <input type="hidden" name="session" value="<random uuid>">  // server stores parsed recipes in memory keyed by this uuid
  <button>Confirm import (3 new, 0 replaced)</button>
</form>
```

Server-side state between preview and commit: the parsed recipe list lives in an in-memory `Map<uuid, ParsedImport>` on the server. The random `session` uuid ties the form submission back to the in-memory copies. Map entries expire after 10 minutes (small sweep on each new commit). For a single-process app this is fine — no need for Redis or DB staging tables. If the server restarts during the preview window: the user re-uploads. Document this in the page ("If you reload, you'll need to re-upload the file").

### 17.1 Empty state

If the file doesn't parse into any recipes (e.g., 0 recipes found or unreadable), the preview page shows "No recipes found in the file." with a "Try another file" link back to `/settings`.

### 17.2 Validation

- File size limit: 50 MB per upload. Runtipi reverse proxy default body size limit may need to be checked; the user may need to set `client_max_body_size` if ZipWithImages is large.
- HTML in ingredient/step strings is stripped server-side before storage (per §16.1 mapping table).
- A recipe with an empty title is rejected: it's not added (or for Replace, the existing row is left untouched). The preview page lists such rows as "Skipped: invalid (no title)".

### 17.3 Header link

Library header gains a small gear icon "Settings" linking to `/settings`. The previous "/export.zip" button is gone.

---

## 18 · What comes after this doc

After user review, the spec is handed to the writing-plans skill to break this into a TDD implementation plan with concrete phase boundaries.