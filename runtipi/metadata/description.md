# Recipe Manager

A self-hosted recipe library with URL import from major French and English recipe sites, full-text search, tagging, and Android share-to-import via PWA.

## Features

- **URL import** — Paste a link from Marmiton, 750g, Allrecipes, BBC Good Food, and more; recipe-scrapers extracts title, ingredients, steps, and image automatically
- **File import** — JSON-LD, Markdown zip, JSON-LD zip formats supported
- **Full-text search** — SQLite FTS5 across titles, ingredients, and instructions
- **Tagging** — Organize recipes with tags; filter and browse by tag
- **Image upload** — Attach photos to recipes; images stored on disk
- **Export** — Download recipes as JSON, PDF, or zip archive
- **PWA** — Installable on Android with share-to-import support via Web Share Target API
- **Single password auth** — One shared password for the whole family; cookie-based sessions

## Configuration

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | — | **Required.** Shared password for all users |
| `SESSION_SECRET` | `APP_PASSWORD` | Secret for cookie signing |
| `PORT` | `3000` | Server port |
| `DATA_DIR` | `/data` | Directory for SQLite database and uploaded images |

## Tech Stack

- **Runtime**: Bun 1.3
- **Framework**: Hono
- **Templates**: Nunjucks
- **Styles**: Tailwind CSS v4
- **Database**: SQLite (FTS5)
- **Scraping**: recipe-scrapers + cheerio
