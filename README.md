# Recipe Manager

A self-hosted, ultra-lightweight recipe manager. CRUD for recipes, great URL import from major French and English recipe sites, full-text search with tag filters, multi-format export, and Android share-to-import via PWA.

Built for a homelab: single Bun process, one SQLite file, ~40-80 MB RAM. Designed to run behind [Runtipi](https://runtipi.io).

## Features

- **URL import** — three-layer extraction ([recipe-scrapers](https://github.com/recipe-scrapers/recipe-scrapers) → [Readability](https://github.com/mozilla/readability) → manual paste). Works on mainstream FR + EN recipe sites. No LLM, no headless browser.
- **Paste-HTML fallback** — when a site blocks server-side fetches (Cloudflare, etc.), paste the page source and extraction retries.
- **Full-text search** — SQLite FTS5 across title, ingredients, and steps. Diacritic-insensitive (`tarte` matches `târté`).
- **Tags** — chips input with autocomplete, clickable sidebar filters.
- **Cook view** — centered header with image/rating/notes above a two-column ingredients/steps body. Print-friendly.
- **Export** — PDF (A4, one recipe per page), Markdown zip, JSON-LD zip.
- **Import from file** — JSON-LD files, RecipeSage exports, and this app's own export zips, with duplicate detection (skip/replace).
- **PWA** — installable to your Android home screen. Tap the browser Share button → "Recipe Manager" to import a URL directly.
- **Themes** — neutral minimalist with a light/dark toggle.
- **Auth** — single shared password for the whole household. No per-user accounts.

## Tech stack

Bun · TypeScript (strict) · Hono · Nunjucks · Tailwind CSS v4 · HTMX · SQLite (bun:sqlite + FTS5) · pdfkit · archiver · jszip

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `APP_PASSWORD` | yes | — | Shared login password. App refuses to boot if unset. |
| `SESSION_SECRET` | no | `APP_PASSWORD` | HMAC key for signing session cookies. |
| `PORT` | no | `3000` | HTTP listen port. |
| `DATA_DIR` | no | `/data` | Directory for `recipes.db` and `images/`. |

## Development

```bash
bun install
bun run build:css        # compile Tailwind
APP_PASSWORD=dev bun run dev
```

Then open http://localhost:3000.

```bash
bun test                 # 121 tests
bun run typecheck
bun run lint
```

## Docker

```bash
docker build -t recipe-manager .
docker run -e APP_PASSWORD=changeme -v recipe-data:/data -p 3000:3000 recipe-manager
```

## Self-hosting on Runtipi

This repo includes a Runtipi app definition under `runtipi/`. Add it to your app store, set `APP_PASSWORD` in the Runtipi UI, and install. A tagged release (`v*.*.*`) publishes a multi-arch image to GHCR via GitHub Actions.

## License

MIT
