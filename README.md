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
- **Auth** — per-user accounts (register with email + password), with a "forgot password" reset flow that emails a single-use, 1-hour link via SMTP. Each user's recipe library is strictly isolated.

## Tech stack

Bun · TypeScript (strict) · Hono · Nunjucks · Tailwind CSS v4 · HTMX · SQLite (bun:sqlite + FTS5) · pdfkit · archiver · jszip

## Configuration

| Env var | Required | Default | Purpose |
|---|---|---|---|
| `SESSION_SECRET` | yes | — | HMAC key for signing session cookies. |
| `APP_BASE_URL` | yes | — | Public base URL, used to build absolute links in reset emails (e.g. `http://recipes.lan:3000`). |
| `SMTP_HOST` | yes | — | SMTP server hostname for sending password-reset emails. |
| `SMTP_FROM` | yes | — | `From:` header for outgoing mail, e.g. `Recipe Manager <noreply@example.com>`. |
| `SMTP_PORT` | no | `587` (or `465` if `SMTP_SECURE=true`) | SMTP server port. |
| `SMTP_USER` | no | — | Username for SMTP AUTH. Enables AUTH when set with `SMTP_PASS`. |
| `SMTP_PASS` | no | — | Password for SMTP AUTH. |
| `SMTP_SECURE` | no | `false` | Use implicit TLS (typically on port 465). When `false`, opportunistic STARTTLS is used. |
| `PORT` | no | `3000` | HTTP listen port. |
| `DATA_DIR` | no | `/data` | Directory for `recipes.db` and `images/`. |

## Development

```bash
bun install
bun run build:css        # compile Tailwind
SESSION_SECRET=dev APP_BASE_URL=http://localhost:3000 SMTP_HOST=127.0.0.1 SMTP_FROM=noreply@localhost bun run dev
```

Then open http://localhost:3000.

```bash
bun test                 # 223 tests
bun run typecheck
bun run lint
```

## Docker

```bash
docker build -t recipe-manager .
docker run \
  -e SESSION_SECRET=changeme \
  -e APP_BASE_URL=http://localhost:3000 \
  -e SMTP_HOST=smtp.example.com \
  -e SMTP_FROM='Recipe Manager <noreply@example.com>' \
  -v recipe-data:/data -p 3000:3000 recipe-manager
```

## Self-hosting on Runtipi

This repo includes a Runtipi app definition under `runtipi/`. Add it to your app store, set `SESSION_SECRET`, `APP_BASE_URL`, `SMTP_HOST`, `SMTP_FROM` (and optionally `SMTP_USER`/`SMTP_PASS`) in the Runtipi UI, and install. A tagged release (`v*.*.*`) publishes a multi-arch image to GHCR via GitHub Actions.

## Upgrading from v1 (shared-password auth)

The v2 release replaces the single `APP_PASSWORD` model with per-user accounts. The migration is **destructive**: existing recipes are wiped on first boot, because every recipe now belongs to a registered user. Take a backup of `recipes.db` before upgrading if you want to preserve the data — re-import via Settings → Import after creating your new account.

## License

MIT
