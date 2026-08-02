# Recipe Manager

A self-hosted recipe library with per-user accounts, URL import from major French and English recipe sites, full-text search, tagging, and Android share-to-import via PWA.

## Features

- **Per-user accounts** — register with email + password; each user has a private recipe library
- **Password reset** — "forgot password" flow emails a single-use, 1-hour link via SMTP
- **URL import** — Paste a link from Marmiton, 750g, Allrecipes, BBC Good Food, and more; recipe-scrapers extracts title, ingredients, steps, and image automatically
- **File import** — JSON-LD, Markdown zip, JSON-LD zip formats supported
- **Full-text search** — SQLite FTS5 across titles, ingredients, and instructions
- **Tagging** — Organize recipes with tags; filter and browse by tag
- **Image upload** — Attach photos to recipes; images stored on disk
- **Export** — Download recipes as JSON, PDF, or zip archive
- **PWA** — Installable on Android with share-to-import support via Web Share Target API

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SESSION_SECRET` | — | **Required.** Secret used to sign login cookies |
| `APP_BASE_URL` | — | **Required.** Public base URL used in reset emails (e.g. `https://recipes.example.com`) |
| `SMTP_HOST` | — | **Required.** SMTP server hostname |
| `SMTP_FROM` | — | **Required.** From address for outgoing mail |
| `SMTP_PORT` | `587` (or `465` if `SMTP_SECURE=true`) | SMTP port |
| `SMTP_USER` | — | Optional; enables SMTP AUTH when set with `SMTP_PASS` |
| `SMTP_PASS` | — | Optional; SMTP password |
| `SMTP_SECURE` | `false` | Use implicit TLS (port 465); otherwise opportunistic STARTTLS |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `/data` | Directory for SQLite database and uploaded images |

## Tech Stack

- **Runtime**: Bun 1.3
- **Framework**: Hono
- **Templates**: Nunjucks
- **Styles**: Tailwind CSS v4
- **Database**: SQLite (FTS5)
- **Scraping**: recipe-scrapers + cheerio
