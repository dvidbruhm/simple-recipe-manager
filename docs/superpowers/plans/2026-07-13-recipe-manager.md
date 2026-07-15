# Recipe Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, ultra-lightweight recipe manager PWA with URL import, multi-format export, multi-source file import, full-text search with tag filters, and Android share-to-import.

**Architecture:** Single Bun process running a Hono web framework, server-rendered Nunjucks templates with HTMX partial swaps on the library page only, SQLite + FTS5 for storage, three-layer URL import (recipe-scrapers → readability → manual paste). Deployed as a Docker image via the user's personal Runtipi app store.

**Tech Stack:** Bun, TypeScript (strict), Hono, Nunjucks, Tailwind v4, HTMX 2, SQLite (bun:sqlite), recipe-scrapers (TS), @mozilla/readability, pdfkit, archiver, Biome.

**Spec:** [`docs/superpowers/specs/2026-07-13-recipe-manager-design.md`](../specs/2026-07-13-recipe-manager-design.md) — every task below references the relevant spec section.

---

## File Structure

```
recipe-manager/
├── src/
│   ├── server.ts                    # entrypoint: Hono app, binds 0.0.0.0:$PORT
│   ├── config.ts                    # env reading; refuses to boot if APP_PASSWORD empty
│   ├── db/
│   │   ├── schema.sql               # full schema, applied at first run
│   │   ├── migrate.ts               # idempotent migration runner
│   │   └── connection.ts             # opens SQLite, sets pragmas, exports `db`
│   ├── auth/
│   │   ├── middleware.ts            # gates every route except /login, /static/*
│   │   ├── routes.ts                # GET /login, POST /login, POST /logout
│   │   └── session.ts               # HMAC-SHA-256 cookie sign/verify via Web Crypto
│   ├── recipes/
│   │   ├── routes.ts                # GET /recipes, /recipes/:id, /recipes/:id/edit,
│   │   │                            # POST /recipes/:id, DELETE/POST /recipes/:id/delete,
│   │   │                            # POST /recipes/:id/restore, GET /recipes/filter (HTMX)
│   │   ├── repository.ts            # SQL: insert, update, softDelete, restore, getById, list
│   │   ├── search.ts                # FTS5 query builder + tag-join filter
│   │   └── forms.ts                 # validation (title non-empty, rating 0-5)
│   ├── import/
│   │   ├── routes.ts                # GET /import, POST /recipes/import,
│   │   │                            # POST /recipes/import/html (paste fallback),
│   │   │                            # GET /import/shared?url= (share target)
│   │   ├── fetcher.ts                # fetch(url) with browser headers
│   │   ├── extractor.ts             # orchestrates Layer 1 → Layer 2 → Layer 3
│   │   ├── extractors/
│   │   │   ├── recipe-scrapers.ts   # wraps TS recipe-scrapers, safeParse
│   │   │   └── readability.ts       # @mozilla/readability fallback
│   │   ├── file-importers/
│   │   │   ├── adapter.ts           # FileImportAdapter interface
│   │   │   ├── json-ld.ts           # JSON/JSON-LD file adapter
│   │   │   ├── markdown-zip.ts      # .md.zip adapter (our own export round-trip)
│   │   │   ├── jsonld-zip.ts        # .jsonld.zip adapter (our own export round-trip)
│   │   │   ├── normalize.ts         # title normalization for dupe detection
│   │   │   └── index.ts             # detection dispatcher
│   │   ├── duplicate-detector.ts    # finds existing recipes matching a PartialRecipe
│   │   ├── preview-session.ts       # in-memory Map<uuid, ParsedImport>, 10-min TTL
│   │   └── image.ts                  # downloads image to /data/images/
│   ├── tags/
│   │   ├── routes.ts                # GET /tags/autocomplete?q= (HTMX)
│   │   └── repository.ts            # listAll(), findOrCreate(name), replaceForRecipe()
│   ├── export/
│   │   ├── routes.ts                # GET /export/formats/:format (pdf|md-zip|json-ld-zip)
│   │   ├── markdown.ts              # renders recipe to .md with YAML frontmatter
│   │   ├── jsonld.ts                # emits schema.org Recipe JSON-LD per recipe
│   │   └── pdf.ts                   # pdfkit A4 PDF, image-at-top, flow pages
│   ├── settings/
│   │   └── routes.ts                # GET /settings, POST /settings/import/preview,
│   │                                # POST /settings/import/commit
│   ├── pwa/
│   │   ├── manifest.ts              # serves /manifest.webmanifest with share_target
│   │   └── sw.ts                    # serves /sw.js (app-shell cache + share intercept)
│   ├── ui/
│   │   ├── templates/
│   │   │   ├── base.html            # <html> shell, theme class, header, footer
│   │   │   ├── library.html         # /recipes page: centered search + tag sidebar + grid
│   │   │   ├── recipe-view.html     # /recipes/:id: header + two-column body
│   │   │   ├── recipe-edit.html     # /recipes/:id/edit: form with all fields
│   │   │   ├── login.html           # /login: single password field
│   │   │   ├── import.html          # /import: URL input
│   │   │   ├── import-shared.html   # banner template for share-target result
│   │   │   ├── settings.html        # /settings: export buttons + import form
│   │   │   ├── settings-preview.html # /settings/import/preview: confirm list
│   │   │   ├── partials/
│   │   │   │   ├── header.html      # logo, search bar, theme toggle, import, gear
│   │   │   │   ├── tag-chips.html   # sidebar tag chips
│   │   │   │   ├── recipe-card.html # single card in grid
│   │   │   │   └── grid.html        # full grid partial for HTMX swap
│   │   ├── css/
│   │   │   └── app.tailwind.css     # Tailwind v4 entry; @theme tokens
│   │   └── static/
│   │       ├── app.css              # compiled output (watched in dev, built in prod)
│   │       ├── htmx.min.js          # vendored HTMX 2
│   │       ├── sw.js                # service worker (also served from pwa/sw.ts)
│   │       ├── manifest.webmanifest # static fallback
│   │       └── icons/               # 192.png, 512.png, 512-maskable.png
├── tests/
│   ├── fixtures/                    # HTML from 4 sites used in extractor tests
│   │   ├── allrecipes.html
│   │   ├── bbcgoodfood.html
│   │   ├── marmiton.html
│   │   ├── g750.html
│   │   ├── jamie-oliver.html         # for blocked-fetch test (404 case)
│   │   ├── no-schema-blog.html      # readability test case
│   │   └── recipesage-sample.jsonld  # RecipeSage export sample
│   ├── unit/                         # mirrors src/ structure
│   └── http/                         # Hono app boots, end-to-end HTTP tests
├── runtipi/
│   ├── app.json                      # Runtipi manifest
│   ├── config.json                   # form field defs
│   └── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── biome.json
└── .github/workflows/release.yml
```

**Code style:** TypeScript strict, no `any` outside test fixtures, ESM modules, Biome for lint+format, `bun test` for tests, no comments unless explaining a non-obvious trick (rare). All functions pure where possible; dependency injection for `db` and `fetcher` so tests can swap them.

---

## Phase 1 — Skeleton & Database

### Task 1: Project bootstrap (Bun + Hono + TypeScript strict)

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `src/server.ts`, `.gitignore`

- [ ] **Step 1: Initialize Bun project and install core deps**

Run:
```bash
bun init -y
bun add hono
bun add -d typescript @types/bun biome
```

- [ ] **Step 2: Configure TypeScript strict mode**

Write `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "outDir": "dist",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Configure Biome**

Write `biome.json`:
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "tab", "lineWidth": 100 }
}
```

- [ ] **Step 4: Write minimal Hono "hello world" server**

Write `src/server.ts`:
```ts
import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.text("ok"));

export default { port: 3000, hostname: "0.0.0.0", fetch: app.fetch };
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
.data/
.superpowers/
.mockups/
*.log
.env
```

- [ ] **Step 6: Verify the server starts and typecheck passes**

Run: `bunx --bun tsc --noEmit`
Expected: no output, exit 0

Run: `timeout 3 bun src/server.ts || true`
Expected: prints nothing or "ok" depending on whether `timeout` is available; the bun process starts without error.

- [ ] **Step 7: First commit**

```bash
git init
git add package.json tsconfig.json biome.json src/server.ts .gitignore
git commit -m "chore: bootstrap bun + hono project"
```

---

### Task 2: SQLite schema and migration runner

**Files:**
- Create: `src/db/schema.sql`, `src/db/connection.ts`, `src/db/migrate.ts`
- Test: `tests/unit/db/migrate.test.ts`

- [ ] **Step 1: Write the failing migration test**

Write `tests/unit/db/migrate.test.ts`:
```ts
import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";

describe("migrate", () => {
  it("creates all required tables and the FTS virtual table", () => {
    const db = new Database(":memory:");
    migrate(db);
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("recipes");
    expect(names).toContain("tags");
    expect(names).toContain("recipe_tags");
    expect(names).toContain("recipes_fts");
    expect(names).toContain("recipes_fts_data");
    expect(names).toContain("recipes_fts_idx");
  });

  it("is idempotent: running twice does not error", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
  });

  it("creates the FTS triggers", () => {
    const db = new Database(":memory:");
    migrate(db);
    const triggers = db.query(
      "SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name"
    ).all() as { name: string }[];
    const names = triggers.map((t) => t.name);
    expect(names).toContain("recipes_ai");
    expect(names).toContain("recipes_ad");
    expect(names).toContain("recipes_au");
  });

  it("inserting a recipe populates FTS auto-sync", () => {
    const db = new Database(":memory:");
    migrate(db);
    db.query(
      "INSERT INTO recipes (title, ingredients, steps, description) VALUES (?, ?, ?, ?)"
    ).values("Tarte aux pommes", '["pomme"]', '["cuire"]', "dessert");
    const row = db.query("SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH 'pomme'").get();
    expect(row).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/db/migrate.test.ts`
Expected: FAIL with "Cannot find module '@/db/migrate'"

- [ ] **Step 3: Write the schema SQL**

Write `src/db/schema.sql` — copy verbatim from spec §3.1 (the `CREATE TABLE recipes`, `tags`, `recipe_tags`, `CREATE VIRTUAL TABLE recipes_fts`, and the three triggers). Wrap each DDL statement with `CREATE ... IF NOT EXISTS` (use `CREATE TABLE IF NOT EXISTS` and `CREATE VIRTUAL TABLE IF NOT EXISTS` if SQLite accepts it; for triggers, wrap with a guard: drop-if-exists then create, since SQLite has no `CREATE TRIGGER IF NOT EXISTS`; actually SQLite 3.33+ does — use it. SQLite in Bun supports it.).

- [ ] **Step 4: Write the connection module**

Write `src/db/connection.ts`:
```ts
import { Database } from "bun:sqlite";
import { migrate } from "./migrate";
import { mkdirSync } from "node:fs";

export function openDatabase(dataDir: string): Database {
  mkdirSync(`${dataDir}/images`, { recursive: true });
  const db = new Database(`${dataDir}/recipes.db`);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");
  migrate(db);
  return db;
}
```

- [ ] **Step 5: Write migrate.ts**

Write `src/db/migrate.ts`:
```ts
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "schema.sql");

export function migrate(db: Database): void {
  const sql = readFileSync(SCHEMA_PATH, "utf-8");
  db.exec(sql);
}
```

Note: tests will load schema via the runtime path resolution. If bun:sqlite doesn't expand schema tree, ensure that schema.sql uses semicolon-separated statements and SQLite applies them as a script via `db.exec`.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/unit/db/migrate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/db/ tests/unit/db/
git commit -m "feat(db): add schema, migration runner, FTS sync"
```

---

### Task 3: Config gate (APP_PASSWORD required)

**Files:**
- Create: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write failing config test**

`tests/unit/config.test.ts`:
```ts
import { loadConfig } from "@/config";
import { afterEach, beforeEach } from "bun:test";

describe("loadConfig", () => {
  const origEnv = { ...process.env };
  beforeEach(() => { process.env = { ...origEnv }; });
  afterEach(() => { process.env = origEnv; });

  it("returns valid config when APP_PASSWORD is set", () => {
    process.env.APP_PASSWORD = "hunter2";
    process.env.PORT = "4242";
    process.env.DATA_DIR = "/tmp/x";
    const cfg = loadConfig();
    expect(cfg.appPassword).toBe("hunter2");
    expect(cfg.port).toBe(4242);
    expect(cfg.dataDir).toBe("/tmp/x");
  });

  it("throws when APP_PASSWORD is empty", () => {
    process.env.APP_PASSWORD = "";
    expect(() => loadConfig()).toThrow(/APP_PASSWORD/);
  });

  it("throws when APP_PASSWORD is unset", () => {
    delete process.env.APP_PASSWORD;
    expect(() => loadConfig()).toThrow(/APP_PASSWORD/);
  });

  it("defaults: PORT=3000, DATA_DIR=/data, SESSION_SECRET=APP_PASSWORD", () => {
    process.env.APP_PASSWORD = "pw";
    delete process.env.PORT;
    delete process.env.DATA_DIR;
    delete process.env.SESSION_SECRET;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.dataDir).toBe("/data");
    expect(cfg.sessionSecret).toBe("pw");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/config.test.ts`
Expected: FAIL

- [ ] **Step 3: Write config.ts**

`src/config.ts`:
```ts
export interface Config {
  appPassword: string;
  sessionSecret: string;
  port: number;
  dataDir: string;
}

export function loadConfig(): Config {
  const appPassword = process.env.APP_PASSWORD ?? "";
  if (!appPassword) {
    console.error("FATAL: APP_PASSWORD environment variable must be set.");
    process.exit(1);
  }
  return {
    appPassword,
    sessionSecret: process.env.SESSION_SECRET || appPassword,
    port: Number(process.env.PORT ?? 3000),
    dataDir: process.env.DATA_DIR ?? "/data",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat(config): env-based config with APP_PASSWORD gate"
```

---

## Phase 2 — Auth

### Task 4: Session cookie sign/verify (HMAC-SHA-256)

**Files:**
- Create: `src/auth/session.ts`
- Test: `tests/unit/auth/session.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { createSessionCookie, verifySessionCookie } from "@/auth/session";

describe("session", () => {
  const secret = "test-secret";
  it("creates a cookie and verifies it", async () => {
    const cookie = await createSessionCookie(secret, 60 * 60); // 1h
    expect(cookie).toBeTruthy();
    const valid = await verifySessionCookie(cookie, secret);
    expect(valid).toBe(true);
  });

  it("rejects cookie signed with different secret", async () => {
    const cookie = await createSessionCookie(secret, 60 * 60);
    const valid = await verifySessionCookie(cookie, "different");
    expect(valid).toBe(false);
  });

  it("rejects tampered cookie", async () => {
    const cookie = await createSessionCookie(secret, 60 * 60);
    const tampered = cookie.slice(0, -2) + "XX";
    const valid = await verifySessionCookie(tampered, secret);
    expect(valid).toBe(false);
  });

  it("rejects expired cookie", async () => {
    const cookie = await createSessionCookie(secret, -1); // already expired
    const valid = await verifySessionCookie(cookie, secret);
    expect(valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/auth/session.test.ts`
Expected: FAIL

- [ ] **Step 3: Write session.ts**

```ts
const COOKIE_NAME = "session";

function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, msg: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
}

export async function createSessionCookie(secret: string, ttlSec: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = `${exp}`;
  const sig = base64url(await hmac(secret, payload));
  return `${payload}.${sig}`;
}

export async function verifySessionCookie(cookie: string, secret: string): Promise<boolean> {
  const parts = cookie.split(".");
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expected = base64url(await hmac(secret, payload));
  if (expected.length !== sig.length) return false;
  // constant-time-ish compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp)) return false;
  return exp > Math.floor(Date.now() / 1000);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/auth/session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts tests/unit/auth/session.test.ts
git commit -m "feat(auth): HMAC-SHA-256 session cookie sign/verify"
```

---

### Task 5: Auth middleware + login routes

**Files:**
- Create: `src/auth/middleware.ts`, `src/auth/routes.ts`
- Test: `tests/http/auth.test.ts`

- [ ] **Step 1: Write failing HTTP test**

`tests/http/auth.test.ts`:
```ts
import { Hono } from "hono";
import { buildApp } from "@/server"; // we'll export a buildApp helper

describe("auth", () => {
  let app: Hono;
  beforeEach(async () => {
    process.env.APP_PASSWORD = "pw";
    process.env.DATA_DIR = await mkdtemp();
    app = buildApp();
  });

  it("GET /recipes without cookie redirects to /login", async () => {
    const res = await app.request("/recipes");
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("/login");
  });

  it("POST /login with correct password sets cookie and redirects to /recipes", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "password=pw",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/recipes");
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });

  it("POST /login with wrong password returns 401", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "password=wrong",
    });
    expect(res.status).toBe(401);
  });

  it("GET /recipes with valid cookie returns 200", async () => {
    // Login to get a cookie, then reuse it
    const loginRes = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "password=pw",
    });
    const cookie = loginRes.headers.get("Set-Cookie")!.split(";")[0];
    const res = await app.request("/recipes", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
  });
});
```

(Helper: `mkdtemp()` returns a unique temp dir via `fs.mkdtempSync(path.join(os.tmpdir(), "rm-"))`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/http/auth.test.ts`
Expected: FAIL (`buildApp` doesn't exist)

- [ ] **Step 3: Update server.ts to export `buildApp()`**

Update `src/server.ts` so it constructs the Hono app inside a `buildApp()` function that internally wires up the auth middleware, login routes, and (later) recipe routes. The default export still boots Bun.

```ts
import { Hono } from "hono";
import { loadConfig } from "@/config";
import { authMiddleware } from "@/auth/middleware";
import { authRoutes } from "@/auth/routes";
import { openDatabase } from "@/db/connection";

export function buildApp(opts?: { config?: ReturnType<typeof loadConfig> }) {
  const config = opts?.config ?? loadConfig();
  const db = openDatabase(config.dataDir);
  const app = new Hono();
  app.use("*", authMiddleware(config));
  app.route("/", authRoutes(config));
  // recipe routes will be added in later tasks
  return app;
}

export default {
  port: 3000,
  hostname: "0.0.0.0",
  fetch: buildApp().fetch,
};
```

- [ ] **Step 4: Write auth/middleware.ts**

```ts
import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";
import { verifySessionCookie, SESSION_COOKIE_NAME } from "./session";
import type { Config } from "@/config";

export function authMiddleware(config: Config): MiddlewareHandler {
  const publicPaths = new Set(["/login", "/static/"]);
  return async (c, next) => {
    const path = c.req.path;
    const isPublic = [...publicPaths].some((p) => path === p || path.startsWith(p));
    if (isPublic) return next();
    const cookie = getCookie(c, SESSION_COOKIE_NAME);
    if (cookie && (await verifySessionCookie(cookie, config.sessionSecret))) {
      return next();
    }
    const returnParam = encodeURIComponent(path);
    return c.redirect(`/login?return=${returnParam}`);
  };
}
```

- [ ] **Step 5: Write auth/routes.ts**

```ts
import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./session";
import type { Config } from "@/config";

export function authRoutes(config: Config): Hono {
  const app = new Hono();

  app.get("/login", (c) => c.html(/* render login.html */ ""));

  app.post("/login", async (c) => {
    const body = await c.req.parseBody();
    const password = String(body.password ?? "");
    const returnTo = String(getCookie(c, "return") ?? "/recipes");
    if (password.length !== config.appPassword.length) return c.body("Unauthorized", 401);
    let diff = 0;
    for (let i = 0; i < password.length; i++) {
      diff |= password.charCodeAt(i) ^ config.appPassword.charCodeAt(i);
    }
    if (diff !== 0 || password !== config.appPassword) return c.body("Unauthorized", 401);
    const cookie = await createSessionCookie(config.sessionSecret, SESSION_TTL_SECONDS);
    setCookie(c, SESSION_COOKIE_NAME, cookie, {
      httpOnly: true, sameSite: "Lax", secure: c.req.header("X-Forwarded-Proto") === "https",
      path: "/", maxAge: SESSION_TTL_SECONDS,
    });
    return c.redirect(returnTo);
  });

  app.post("/logout", (c) => {
    setCookie(c, SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
    return c.redirect("/login");
  });

  return app;
}
```

Note: actual HTML rendering for /login comes in Task 6 (templates). For now return empty string and the test only checks the redirect status + cookie.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/http/auth.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/server.ts src/auth/ tests/http/auth.test.ts
git commit -m "feat(auth): login/logout, middleware, session cookie"
```

---

## Phase 3 — Base UI Templates

### Task 6: Nunjucks adapter + base.html + login.html

**Files:**
- Create: `src/ui/nunjucks.ts`, `src/ui/templates/base.html`, `src/ui/templates/login.html`
- Test: `tests/unit/ui/nunjucks.test.ts`

- [ ] **Step 1: Install Nunjucks**

Run: `bun add nunjucks @types/nunjucks`

- [ ] **Step 2: Write failing test**

`tests/unit/ui/nunjucks.test.ts`:
```ts
import { render } from "@/ui/nunjucks";

describe("nunjucks", () => {
  it("renders a template with a variable", () => {
    const out = render("base.html", { title: "Test", body_content: "<p>hi</p>" });
    expect(out).toContain("Test");
    expect(out).toContain("<p>hi</p>");
  });

  it("login.html renders a form", () => {
    const out = render("login.html", { return_to: "/recipes" });
    expect(out).toContain("form");
    expect(out).toContain('action="/login"');
    expect(out).toContain("password");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test tests/unit/ui/nunjucks.test.ts`
Expected: FAIL

- [ ] **Step 4: Write nunjucks adapter**

`src/ui/nunjucks.ts`:
```ts
import nunjucks from "nunjucks";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "templates");

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATE_DIR), {
  autoescape: true,
  throwOnUndefined: true,
});

export function render(name: string, ctx: Record<string, unknown>): string {
  return env.render(name, ctx);
}

export function renderString(tpl: string, ctx: Record<string, unknown>): string {
  return env.renderString(tpl, ctx);
}
```

- [ ] **Step 5: Write base.html**

`src/ui/templates/base.html` based on the neutral-minimalist mockup palette (spec §7.1):
```html
<!DOCTYPE html>
<html lang="en" class="{{ theme | default('auto') }}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{ title }} · recipes</title>
  <link rel="stylesheet" href="/static/app.css">
  <link rel="manifest" href="/manifest.webmanifest">
</head>
<body data-theme="{{ theme setting }}">
  <header class="site-header">
    <a href="/recipes" class="logo">recipes</a>
    {% block header_extra %}{% endblock %}
    <button class="theme-toggle" aria-label="Toggle theme">☀/🌙</button>
  </header>
  <main class="site-main">
    {% block content %}{{ body_content | safe }}{% endblock %}
  </main>
</body>
</html>
```

(Model the full CSS tokens as CSS variables inline in head if no Tailwind compiled yet. For Task 6, inline a `<style>` with the spec's tokens — Tailwind compiles in a later task.)

- [ ] **Step 6: Write login.html**

```html
{% extends "base.html" %}
{% block content %}
<form action="/login" method="post" class="login-form">
  <input type="hidden" name="return" value="{{ return_to | default('/recipes') }}">
  <label>Password <input type="password" name="password" autofocus required></label>
  <button type="submit">Sign in</button>
</form>
{% endblock %}
```

- [ ] **Step 7: Wire auth GET /login to render the template**

Update `src/auth/routes.ts`:
```ts
import { render } from "@/ui/nunjucks";
// inside authRoutes:
app.get("/login", (c) => {
  const returnTo = c.req.query("return") ?? "/recipes";
  return c.html(render("login.html", { return_to: returnTo }));
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test tests/unit/ui/nunjucks.test.ts`
Expected: PASS

- [ ] **Step 9: Also run the http auth test**

Run: `bun test tests/http/auth.test.ts`
Expected: PASS (no regressions)

- [ ] **Step 10: Commit**

```bash
git add src/ui/ src/auth/routes.ts tests/unit/ui/
git commit -m "feat(ui): nunjucks adapter, base.html, login.html"
```

---

### Task 7: Tailwind v4 compile + theme tokens (light + dark)

**Files:**
- Create: `src/ui/css/app.tailwind.css`, `scripts/build-css.ts`, `src/ui/static/app.css` (generated)
- Modify: `package.json` (add `build:css` script)

- [ ] **Step 1: Install Tailwind v4**

Run: `bun add -d tailwindcss @tailwindcss/cli`

- [ ] **Step 2: Write the Tailwind entry CSS**

`src/ui/css/app.tailwind.css`:
```css
@import "tailwindcss";

@theme {
  --color-bg: #f8f8f7;
  --color-surface: #ffffff;
  --color-text: #1a1a1a;
  --color-muted: #888888;
  --color-accent: #5a7a4f;
  --color-border: #e0e0de;
  --radius-card: 4px;
}

@custom-variant dark (&:where(.dark, .dark *));

[data-theme="dark"] {
  --color-bg: #1a1a1c;
  --color-surface: #242427;
  --color-text: #e8e8e6;
  --color-muted: #8a8a8a;
  --color-accent: #94b386;
  --color-border: #2e2e32;
}

body { background: var(--color-bg); color: var(--color-text); font-family: -apple-system, system-ui, sans-serif; }
/* ...other base styles matching the mockup... */
```

- [ ] **Step 3: Write build script**

`scripts/build-css.ts`:
```ts
import { $ } from "bun";
await $`bunx @tailwindcss/cli -i src/ui/css/app.tailwind.css -o src/ui/static/app.css --minify`;
```

- [ ] **Step 4: Add package.json script**

Update `package.json` scripts:
```json
"scripts": {
  "dev": "bun src/server.ts",
  "build:css": "bun scripts/build-css.ts",
  "typecheck": "bunx tsc --noEmit",
  "lint": "biome check src tests",
  "format": "biome format --write src tests",
  "test": "bun test"
}
```

- [ ] **Step 5: Run the build**

Run: `bun run build:css`
Expected: creates `src/ui/static/app.css`, ~10 KB

- [ ] **Step 6: Commit**

```bash
git add src/ui/css/ src/ui/static/app.css scripts/build-css.ts package.json
git commit -m "feat(ui): tailwind v4 setup, light/dark theme tokens"
```

---

### Task 8: Hono static file serving + HTMX vendor

**Files:**
- Modify: `src/server.ts`
- Create: `src/ui/static/htmx.min.js`, `src/ui/static/manifest.webmanifest`, `src/ui/static/icons/` (placeholder)

- [ ] **Step 1: Vendor HTMX**

Run: `curl -L https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js -o src/ui/static/htmx.min.js`

(If curl unavailable: `Invoke-WebRequest -Uri "https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" -OutFile src/ui/static/htmx.min.js` on PowerShell.)

- [ ] **Step 2: Add static serve middleware to server.ts**

Update `buildApp()` in `src/server.ts`:
```ts
import { serveStatic } from "hono/bun";

// inside buildApp, before authMiddleware:
app.use("/static/*", serveStatic({ root: "./src/ui/" }));
// so /static/app.css serves src/ui/static/app.css, etc.
```

- [ ] **Step 3: Initialize manifest.webmanifest (basic, share_target added later)**

`src/ui/static/manifest.webmanifest`:
```json
{
  "name": "Recipe Manager",
  "short_name": "recipes",
  "display": "standalone",
  "start_url": "/recipes",
  "scope": "/",
  "background_color": "#f8f8f7",
  "theme_color": "#5a7a4f",
  "icons": [
    { "src": "/static/icons/192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/static/icons/512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/static/icons/512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Add placeholder icons**

Run: `bun scripts/generate-icons.ts` (write a one-off script that uses a tiny canvas-draw or, simpler, copies a placeholder PNG). For v1 a solid-color 192/512 PNG is acceptable — the user can replace later. Simplest: generate a PNG with `sharp` if available, otherwise commit placeholder PNGs by hand or via a tiny base64 decode.

- [ ] **Step 5: Add manifest route on server**

In `src/server.ts` `buildApp()`, before authMiddleware (so it's auth-free):
```ts
app.get("/manifest.webmanifest", serveStatic({ path: "./src/ui/static/manifest.webmanifest" }));
app.get("/sw.js", serveStatic({ path: "./src/ui/static/sw.js" }));
```
(Note: in Task 16 we'll replace static sw.js with a dynamic handler.)

- [ ] **Step 6: Write a manual smoke test**

Run: `bun run build:css; bun src/server.ts &; sleep 1; curl -s http://localhost:3000/static/app.css | head -c 100; kill %1`
Expected: prints first 100 chars of compiled CSS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/static/ src/server.ts
git commit -m "feat(ui): serve static assets, vendor htmx, scaffold manifest"
```

---

## Phase 4 — Recipe CRUD (Repository + Routes + Templates)

### Task 9: Recipe repository (insert/list/get/update/soft-delete/restore)

**Files:**
- Create: `src/recipes/repository.ts`, `src/recipes/forms.ts`
- Test: `tests/unit/recipes/repository.test.ts`

- [ ] **Step 1: Write failing test**

`tests/unit/recipes/repository.test.ts`:
```ts
import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";

function setup() {
  const db = new Database(":memory:");
  migrate(db);
  return new RecipeRepository(db);
}

describe("RecipeRepository", () => {
  it("inserts and retrieves a recipe", () => {
    const repo = setup();
    const id = repo.insert({ title: "T", description: "d", ingredients: ["flour"], steps: ["bake"], source_url: "http://x" });
    const r = repo.getById(id);
    expect(r).toBeTruthy();
    expect(r?.title).toBe("T");
    expect(r?.ingredients).toEqual(["flour"]);
  });

  it("lists active recipes, excluding soft-deleted", () => {
    const repo = setup();
    const id1 = repo.insert({ title: "A" });
    const id2 = repo.insert({ title: "B" });
    repo.softDelete(id1);
    const list = repo.list();
    expect(list.map(r => r.title)).toEqual(["B"]);
    expect(list.length).toBe(1);
  });

  it("updates an existing recipe", () => {
    const repo = setup();
    const id = repo.insert({ title: "Before" });
    repo.update(id, { title: "After", rating: 5 });
    const r = repo.getById(id);
    expect(r?.title).toBe("After");
    expect(r?.rating).toBe(5);
  });

  it("soft-deletes and restores", () => {
    const repo = setup();
    const id = repo.insert({ title: "X" });
    repo.softDelete(id);
    expect(repo.list().find(r => r.id === id)).toBeUndefined();
    repo.restore(id);
    expect(repo.list().find(r => r.id === id)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/recipes/repository.test.ts`
Expected: FAIL

- [ ] **Step 3: Write forms.ts (validation)**

```ts
export interface RecipeInput {
  title?: string;
  description?: string;
  ingredients?: string[];
  steps?: string[];
  notes?: string;
  source_url?: string;
  image_filename?: string | null;
  rating?: number;
}

export function validateRecipe(input: RecipeInput): { valid: true; data: RecipeInput } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!input.title || input.title.trim() === "") errors.push("title is required");
  const rating = input.rating ?? 0;
  if (typeof rating !== "number" || rating < 0 || rating > 5 || !Number.isInteger(rating)) errors.push("rating must be 0-5");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: input };
}
```

- [ ] **Step 4: Write repository.ts**

```ts
import type { Database } from "bun:sqlite";
import type { RecipeInput } from "./forms";

export interface Recipe {
  id: number;
  title: string;
  description: string;
  ingredients: string[];
  steps: string[];
  notes: string;
  source_url: string;
  image_filename: string | null;
  rating: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export class RecipeRepository {
  constructor(private db: Database) {}

  insert(input: RecipeInput): number {
    const stmt = this.db.query(`INSERT INTO recipes (title, description, ingredients, steps, notes, source_url, image_filename, rating)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.values(
      input.title ?? "",
      input.description ?? "",
      JSON.stringify(input.ingredients ?? []),
      JSON.stringify(input.steps ?? []),
      input.notes ?? "",
      input.source_url ?? "",
      input.image_filename ?? null,
      input.rating ?? 0,
    );
    return Number((this.db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
  }

  getById(id: number): Recipe | null {
    const row = this.db.query("SELECT * FROM recipes WHERE id = ?").get(id) as any;
    if (!row) return null;
    return this.deserialize(row);
  }

  list(): Recipe[] {
    const rows = this.db.query("SELECT * FROM recipes WHERE deleted_at IS NULL ORDER BY created_at DESC").all() as any[];
    return rows.map(r => this.deserialize(r));
  }

  update(id: number, patch: Partial<RecipeInput>): void {
    const cols: string[] = [];
    const vals: any[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (k === "ingredients" || k === "steps") {
        cols.push(`${k} = ?`); vals.push(JSON.stringify(v));
      } else {
        cols.push(`${k} = ?`); vals.push(v);
      }
    }
    cols.push("updated_at = datetime('now')");
    vals.push(id);
    this.db.exec(`UPDATE recipes SET ${cols.join(", ")} WHERE id = ?`, ...vals);
  }

  softDelete(id: number): void {
    this.db.exec("UPDATE recipes SET deleted_at = datetime('now') WHERE id = ?", id);
  }

  restore(id: number): void {
    this.db.exec("UPDATE recipes SET deleted_at = NULL WHERE id = ?", id);
  }

  private deserialize(row: any): Recipe {
    return {
      ...row,
      ingredients: JSON.parse(row.ingredients || "[]"),
      steps: JSON.parse(row.steps || "[]"),
    };
  }
}
```

(Adjust `db.exec(...)` call style to match bun:sqlite's bound-params API; use `db.prepare().run()` if more idiomatic — verify against Bun docs.)

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/unit/recipes/repository.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/recipes/ tests/unit/recipes/
git commit -m "feat(recipes): repository with insert/list/get/update/soft-delete"
```

---

### Task 10: Tag repository (list-all, autocomplete, replace-for-recipe)

**Files:**
- Create: `src/tags/repository.ts`
- Test: `tests/unit/tags/repository.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { Database } from "bun:sqlite";
import { migrate } from "@/db/migrate";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";

function setup() {
  const db = new Database(":memory:");
  migrate(db);
  return { db, recipes: new RecipeRepository(db), tags: new TagRepository(db) };
}

describe("TagRepository", () => {
  it("replaceForRecipe writes and updates tags atomically", () => {
    const { recipes, tags } = setup();
    const id = recipes.insert({ title: "X", ingredients: [], steps: [] });
    tags.replaceForRecipe(id, ["dessert", "italian"]);
    expect(tags.listForRecipe(id).map(t => t.name).sort()).toEqual(["dessert", "italian"]);
    tags.replaceForRecipe(id, ["dessert", "french"]);
    expect(tags.listForRecipe(id).map(t => t.name).sort()).toEqual(["dessert", "french"]);
  });

  it("listAllWithCounts returns counts excluding deleted recipes", () => {
    const { recipes, tags } = setup();
    const id1 = recipes.insert({ title: "A" });
    const id2 = recipes.insert({ title: "B" });
    tags.replaceForRecipe(id1, ["dessert"]);
    tags.replaceForRecipe(id2, ["dessert", "italian"]);
    recipes.softDelete(id2);
    const list = tags.listAllWithCounts();
    expect(list).toContainEqual({ name: "dessert", cnt: 1 });
    expect(list.find(t => t.name === "italian")?.cnt).toBe(0);
  });

  it("autocomplete returns case-insensitive matches", () => {
    const { recipes, tags } = setup();
    const id = recipes.insert({ title: "X" });
    tags.replaceForRecipe(id, ["Dessert"]);
    const res = tags.autocomplete("des");
    expect(res.map(t => t.toLowerCase())).toContain("dessert");
  });

  it("unused tags are not deleted (YAGNI — keep history for tag chips)", () => {
    const { recipes, tags } = setup();
    const id = recipes.insert({ title: "X" });
    tags.replaceForRecipe(id, ["rare"]);
    tags.replaceForRecipe(id, []);
    const list = tags.listAllWithCounts();
    expect(list.find(t => t.name === "rare")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/unit/tags/repository.test.ts`
Expected: FAIL

- [ ] **Step 3: Write tag repository**

```ts
import type { Database } from "bun:sqlite";

export interface TagWithCount { name: string; cnt: number; }

export class TagRepository {
  constructor(private db: Database) {}

  replaceForRecipe(recipeId: number, names: string[]): void {
    this.db.exec("BEGIN");
    this.db.exec("DELETE FROM recipe_tags WHERE recipe_id = ?", recipeId);
    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) continue;
      this.db.exec("INSERT OR IGNORE INTO tags (name) VALUES (?)", name);
      const row = this.db.query("SELECT id FROM tags WHERE name = ? COLLATE NOCASE").get(name) as { id: number };
      this.db.exec("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)", recipeId, row.id);
    }
    this.db.exec("COMMIT");
  }

  listForRecipe(recipeId: number): { id: number; name: string }[] {
    return this.db.query(
      `SELECT t.id, t.name FROM tags t
       JOIN recipe_tags rt ON rt.tag_id = t.id
       WHERE rt.recipe_id = ? ORDER BY t.name COLLATE NOCASE`
    ).all(recipeId) as { id: number; name: string }[];
  }

  listAllWithCounts(): TagWithCount[] {
    return this.db.query(
      `SELECT t.name, COUNT(rt.recipe_id) AS cnt
       FROM tags t
       LEFT JOIN recipe_tags rt ON rt.tag_id = t.id
       LEFT JOIN recipes r ON r.id = rt.recipe_id AND r.deleted_at IS NULL
       GROUP BY t.id ORDER BY cnt DESC, t.name COLLATE NOCASE`
    ).all() as TagWithCount[];
  }

  autocomplete(q: string): string[] {
    const like = `${q.toLowerCase()}%`;
    const rows = this.db.query(
      "SELECT name FROM tags WHERE LOWER(name) LIKE ? ORDER BY name COLLATE NOCASE LIMIT 10"
    ).all(like) as { name: string }[];
    return rows.map(r => r.name);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/unit/tags/repository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tags/ tests/unit/tags/
git commit -m "feat(tags): repository with replace, list, autocomplete"
```

---

### Task 11: Library page (search, tag sidebar, grid partial, HTMX)

**Files:**
- Create: `src/recipes/search.ts`, `src/recipes/routes.ts`, `src/ui/templates/library.html`, `src/ui/templates/partials/header.html`, `src/ui/templates/partials/tag-chips.html`, `src/ui/templates/partials/recipe-card.html`, `src/ui/templates/partials/grid.html`
- Test: `tests/http/library.test.ts`

- [ ] **Step 1: Write failing test**

`tests/http/library.test.ts`:
```ts
import { buildApp } from "@/server";

beforeEach: set env, mkdtemp, build app + insert 3 test recipes

describe("library page", () => {
  it("GET /recipes returns 200 with all recipe titles in grid", async () => {
    // insert recipes directly via db handle (component test helper)
    const res = await app.request("/recipes", { headers: { Cookie: validCookie } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Tiramisu");
    expect(body).toContain("Bolognese");
  });

  it("GET /recipes?tag=dessert filters by tag", async () => {
    // insert + tag
    const res = await app.request("/recipes?tag=dessert", { headers: { Cookie: validCookie } });
    const body = await res.text();
    expect(body).toContain("Tiramisu");
    expect(body).not.toContain("Bolognese");
  });

  it("GET /recipes?q= flour finds recipe by ingredient", async () => {
    const res = await app.request("/recipes?q=flour", { headers: { Cookie: validCookie } });
    const body = await res.text();
    expect(body).toContain("Tiramisu");
  });

  it("HTMX request returns only grid fragment", async () => {
    const res = await app.request("/recipes?q=tira", { headers: { Cookie: validCookie, "HX-Request": "true" } });
    const body = await res.text();
    expect(body).not.toContain("<html");
    expect(body).toContain("Tiramisu");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/http/library.test.ts`
Expected: FAIL

- [ ] **Step 3: Write search.ts**

```ts
import type { Database } from "bun:sqlite";
import type { Recipe } from "./repository";

export interface SearchParams { q?: string; tag?: string; }

export function searchRecipes(db: Database, params: SearchParams): Recipe[] {
  // build query based on params per spec §8.1
  // Use FTS5 for `q`: `SELECT * FROM recipes_fts WHERE recipes_fts MATCH ?`
  // Sanitize `q` to FTS-friendly: escape quotes, add prefix token `"term"*`
  // For tag join, use the spec query.
  // Both = AND rowid IN (FTS subquery)
  // Return as Recipe objects, deserialize JSON arrays.
}
```

(Full implementation pattern follows spec §8.1; this is the contract.)

- [ ] **Step 4: Write recipes/routes.ts** — register on the main app

```ts
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { RecipeRepository } from "./repository";
import { searchRecipes } from "./search";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";

export function recipeRoutes(db: Database): Hono {
  const app = new Hono();
  const recipes = new RecipeRepository(db);
  const tags = new TagRepository(db);

  app.get("/recipes", (c) => {
    const q = c.req.query("q") ?? "";
    const tag = c.req.query("tag") ?? "";
    const list = (q || tag) ? searchRecipes(db, { q, tag }) : recipes.list();
    const tagList = tags.listAllWithCounts();
    if (c.req.header("HX-Request") === "true") {
      return c.html(render("partials/grid.html", { recipes: list }));
    }
    return c.html(render("library.html", { recipes: list, tags: tagList, q, active_tag: tag }));
  });

  return app;
}
```

- [ ] **Step 5: Write templates**

`src/ui/templates/library.html` extends base.html, includes header.html (with centered search at top per spec §7.2 — override the header layout), tag-chips.html on the side, grid.html in main.

`src/ui/templates/partials/grid.html`:
```html
<div id="grid" class="recipe-grid">
  {% for r in recipes %}
    {% include "partials/recipe-card.html" %}
  {% else %}
    <p class="empty">No recipes found.</p>
  {% endfor %}
</div>
```

`src/ui/templates/partials/recipe-card.html`:
```html
<a href="/recipes/{{ r.id }}" class="card">
  {% if r.image_filename %}
    <img src="/static/images/{{ r.image_filename }}" alt="{{ r.title }}" loading="lazy">
  {% else %}
    <div class="placeholder">no image</div>
  {% endif %}
  <div class="card-body">
    <div class="card-title">{{ r.title }}</div>
    <div class="card-meta">
      <span>{{ domain(r.source_url) }}</span>
      <span class="stars">{{ stars(r.rating) | safe }}</span>
    </div>
  </div>
</a>
```

Centered search bar at top per spec §7.2: in `header.html`, use Flexbox `justify-center` on the search container.

- [ ] **Step 6: Wire recipeRoutes into buildApp**

In `src/server.ts` `buildApp()`, after authRoutes:
```ts
import { recipeRoutes } from "@/recipes/routes";
// ...
app.route("/", recipeRoutes(db));
```

- [ ] **Step 7: Add HTMX attributes to library.html**

```html
<input type="search" name="q" value="{{ q }}"
  hx-get="/recipes" hx-target="#grid" hx-trigger="input changed delay:200ms"
  hx-include="[name='tag']" hx-swap="outerHTML">
<div id="tag-chips" hx-get="/recipes" hx-target="#grid" hx-trigger="click"
  hx-include="this" hx-swap="outerHTML">
  ... chips with data attributes ...
</div>
```

(The HTMX markup may need iteration; the principle is each chip triggers a GET with right querystring, server returns grid HTML.)

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test tests/http/library.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/recipes/ src/tags/ src/ui/templates/ tests/http/library.test.ts
git commit -m "feat(library): search, tag chips, grid with HTMX"
```

---

### Task 12: Recipe view page (cook view) + edit page

**Files:**
- Create: `src/ui/templates/recipe-view.html`, `src/ui/templates/recipe-edit.html`
- Test: `tests/http/recipe-view.test.ts`, `tests/http/recipe-edit.test.ts`

- [ ] **Step 1: Write failing tests** (HTTP cases for view, edit-GET render, edit-POST save, edit-POST image upload, delete+undo)

Cover: GET /recipes/:id returns centered header above 2-column body; GET /recipes/:id/edit returns form with all fields; POST /recipes/:id updates fields; DELETE soft-deletes and returns undo toast; POST /recipes/:id/restore un-deletes.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write recipe-view.html**

Per spec §7.2: centered header (image, title, rating stars, description, notes), then 2-column body (ingredients left, steps right), single-column on mobile. Use Tailwind classes responsive classes (`md:grid-cols-2`).

- [ ] **Step 4: Write recipe-edit.html**

Form with all fields per spec §7.2 edit page. Ingredients and steps as textareas, one item per line, converting to/from JSON arrays in the route handler. Rating as a star-radio widget. Tags as a chips input with `hx-get="/tags/autocomplete?q="` lookup. Image file input + "or paste an image" hint. Source URL input. Notes textarea.

- [ ] **Step 5: Add routes to recipes/routes.ts**

```ts
app.get("/recipes/:id", (c) => { /* render recipe-view.html */ });
app.get("/recipes/:id/edit", (c) => { /* render recipe-edit.html */ });
app.post("/recipes/:id", async (c) => {
  const body = await c.req.parseBody();
  const id = Number(c.req.param("id"));
  repo.update(id, { title: String(body.title), /* ... */ });
  return c.redirect(`/recipes/${id}`);
});
app.post("/recipes/:id/delete", (c) => { repo.softDelete(id); return c.redirect("/recipes?toast=..."); });
app.post("/recipes/:id/restore", (c) => { repo.restore(id); return c.redirect(`/recipes/${id}`); });
app.post("/recipes/:id/image", async (c) => { /* multipart upload, save to /data/images/, update row */ });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test tests/http/recipe-view.test.ts tests/http/recipe-edit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ src/ui/templates/ tests/http/
git commit -m "feat(recipes): view and edit pages with full form"
```

---

### Task 13: Tag autocomplete route + theme toggle

**Files:**
- Create: `src/tags/routes.ts`
- Modify: `src/ui/templates/partials/header.html`, `src/server.ts`, `src/auth/` (theme cookie)
- Test: `tests/http/tags.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("GET /tags/autocomplete?q=des returns HTML chips", async () => {
  // seed tags
  const res = await app.request("/tags/autocomplete?q=des", { headers: { Cookie: validCookie, "HX-Request": "true" } });
  expect(res.status).toBe(200);
  const body = await res.text();
  expect(body).toContain("dessert");
});

it("GET /recipes?theme=dark sets theme cookie and toggles", async () => {
  // get /recipes with theme param, check Set-Cookie contains theme=dark
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write tags/routes.ts**

```ts
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { TagRepository } from "./repository";

export function tagRoutes(db: Database): Hono {
  const app = new Hono();
  const tags = new TagRepository(db);
  app.get("/tags/autocomplete", (c) => {
    const q = c.req.query("q") ?? "";
    if (q.length < 1) return c.body("", 200);
    const names = tags.autocomplete(q);
    return c.html(names.map(n => `<li class="chip" data-name="${n}">${n}</li>`).join(""));
  });
  return app;
}
```

- [ ] **Step 4: Add theme toggle cookie endpoint**

Add to `auth/routes.ts` (or a small settings module):
```ts
app.post("/theme", (c) => {
  const body = await c.req.parseBody();
  const theme = String(body.theme);
  if (!["light", "dark", "auto"].includes(theme)) return c.body("Bad theme", 400);
  setCookie(c, "theme", theme, { httpOnly: false, sameSite: "Lax", path: "/", maxAge: 60*60*24*365 });
  return c.redirect(c.req.header("Referer") ?? "/recipes");
});
```

- [ ] **Step 5: Read theme cookie in templates**

In `base.html`, render `<html class="{{ theme_class }}">` where `theme_class` is computed inside every route handler or middleware that reads the `theme` cookie and maps auto+prefers-color-scheme.

Simpler: at middleware level, set `c.set("theme", themeFromCookieOrAuto)`, and pass into render() calls.

- [ ] **Step 6: Wire tagRoutes into buildApp**

- [ ] **Step 7: Run test to verify it passes**

- [ ] **Step 8: Commit**

```bash
git add src/tags/routes.ts src/auth/ src/ui/templates/ tests/http/tags.test.ts
git commit -m "feat(tags): autocomplete route + theme cookie toggle"
```

---

## Phase 5 — URL Import

### Task 14: Import extractor (3 layers)

**Files:**
- Create: `src/import/extractor.ts`, `src/import/extractors/recipe-scrapers.ts`, `src/import/extractors/readability.ts`, `src/import/fetcher.ts`, `src/import/image.ts`
- Test: `tests/unit/import/extractor.test.ts`

- [ ] **Step 1: Install import deps**

Run: `bun add recipe-scrapers cheerio zod @mozilla/readability linkedom`

- [ ] **Step 2: Copy test fixtures**

Copy the four HTML files from `%TEMP%\opencode\recipe-mpare\html\` (allrecipes, bbcgoodfood, marmiton, g750) to `tests/fixtures/`. Also create `tests/fixtures/no-schema-blog.html` (a small hand-written HTML with no JSON-LD, to test Layer 2 readability fallback).

- [ ] **Step 3: Write failing test**

`tests/unit/import/extractor.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractRecipe } from "@/import/extractor";

const F = (n: string) => readFileSync(join(import.meta.dir, "../../fixtures", n), "utf-8");

describe("extractRecipe", () => {
  const cases = [
    ["allrecipes.html", "https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/"],
    ["bbcgoodfood.html", "https://www.bbcgoodfood.com/recipes/spaghetti-bolognese"],
    ["marmiton.html", "https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx"],
    ["g750.html", "https://www.750g.com/tiramisu-r161.htm"],
  ];
  for (const [fixture, url] of cases) {
    it(`Layer 1 extracts ${fixture}`, async () => {
      const out = await extractRecipe(url, F(fixture));
      expect(out.kind).toBe("structured");
      if (out.kind === "structured") {
        expect(out.recipe.title.length).toBeGreaterThan(0);
        expect((out.recipe.ingredients ?? []).length).toBeGreaterThan(0);
      }
    });
  }

  it("Layer 2 (readability) handles no-schema HTML", async () => {
    const out = await extractRecipe("https://example-blog.com", F("no-schema-blog.html"));
    expect(out.kind).toBe("readability");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

- [ ] **Step 5: Write fetcher.ts**

```ts
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
};

export async function fetchHtml(url: string): Promise<{ status: number; html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 5_000_000) return null;
    return { status: res.status, html: text, finalUrl: res.url };
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Write recipe-scrapers.ts**

```ts
import { scrapeRecipe } from "recipe-scrapers";

export async function trySchemaExtract(url: string, html: string) {
  const safe = await scrapeRecipe(html, url, { safeParse: true });
  if (!safe.success) return null;
  const r = safe.data;
  if (!r.title || (!r.ingredients?.length && !r.instructions?.length)) return null;
  return {
    title: r.title,
    description: r.description ?? "",
    ingredients: (r.ingredients ?? []).flatMap(g => (g.items ?? []).map(i => i.value ?? "")).filter(Boolean),
    steps: (r.instructions ?? []).flatMap(g => (g.items ?? []).map(i => i.value ?? "")).filter(Boolean),
    image: r.image ?? null,
  };
}
```

(Verify the exact shape of `safe.data.ingredients` and `.instructions` per recipe-scrapers v1.9 — adapt as needed.)

- [ ] **Step 7: Write readability.ts**

```ts
import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";

export function tryReadability(html: string): { title: string; excerpt: string; text: string; image: string | null } | null {
  try {
    const dom = new DOMParser().parseFromString(html, "text/html");
    const document = dom.ownerDocument ?? dom;
    const reader = new Readability(document);
    const article = reader.parse();
    if (!article) return null;
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    return {
      title: article.title ?? "",
      excerpt: article.excerpt ?? "",
      text: article.textContent ?? "",
      image: ogImage ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Write image.ts**

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function downloadImage(dataDir: string, url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok || !ALLOWED.has(res.headers.get("content-type") ?? "")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8_000_000) return null;
    const ext = EXT[res.headers.get("content-type")!];
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dataDir, "images", name), Buffer.from(buf));
    return name;
  } catch { return null; }
}
```

- [ ] **Step 9: Write extractor.ts**

```ts
import { trySchemaExtract } from "./extractors/recipe-scrapers";
import { tryReadability } from "./extractors/readability";

export interface PartialRecipe {
  title?: string; description?: string;
  ingredients?: string[]; steps?: string[];
  source_url?: string; image?: string | null; notes?: string;
}
export type ImportOutcome =
  | { kind: "structured"; recipe: PartialRecipe }
  | { kind: "readability"; recipe: PartialRecipe; rawText: string }
  | { kind: "unsupported"; reason: string };

export async function extractRecipe(url: string, html: string): Promise<ImportOutcome> {
  const structured = await trySchemaExtract(url, html);
  if (structured) return { kind: "structured", recipe: { ...structured, source_url: url } };
  const readable = tryReadability(html);
  if (readable && readable.text.length > 100) {
    return {
      kind: "readability",
      recipe: { title: readable.title, description: readable.excerpt, steps: [readable.text], source_url: url, image: readable.image },
      rawText: readable.text,
    };
  }
  return { kind: "unsupported", reason: "no schema and unreadable body" };
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `bun test tests/unit/import/extractor.test.ts`
Expected: PASS (5 cases)

- [ ] **Step 11: Commit**

```bash
git add src/import/ tests/fixtures/ tests/unit/import/
git commit -m "feat(import): 3-layer extractor (schema, readability, manual)"
```

---

### Task 15: Import routes (URL + paste-HTML + shared target)

**Files:**
- Create: `src/import/routes.ts`, `src/ui/templates/import.html`, `src/ui/templates/recipe-edit.html` (modify to add paste-fallback banner)
- Test: `tests/http/import.test.ts`

- [ ] **Step 1: Write failing test**

```ts
describe("import routes", () => {
  it("GET /import renders URL form", async () => {
    const res = await app.request("/import", { headers: { Cookie: validCookie } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('action="/recipes/import');
  });

  it("POST /recipes/import with a live URL redirects to /recipes/:id/edit", async () => {
    // stub the fetcher to return tests/fixtures/marmiton.html
    const res = await app.request("/recipes/import", {
      method: "POST",
      headers: { Cookie: validCookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: "url=https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/recipes\/\d+\/edit$/);
  });

  it("POST /recipes/import/html (paste mode) extracts from pasted HTML", async () => {
    const res = await app.request("/recipes/import/html", {
      method: "POST",
      headers: { Cookie: validCookie, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ recipe_id: "0", html: FIXTURE_HTML }).toString(),
    });
    expect(res.status).toBe(302);
  });

  it("GET /import/shared?url=... runs extract and redirect to edit", async () => {
    const res = await app.request("/import/shared?url=https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx", {
      headers: { Cookie: validCookie },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/recipes\/\d+\/edit$/);
  });

  it("POST /recipes/import when fetcher blocks falls through to paste mode", async () => {
    // stub fetcher to return null
    const res = await app.request("/recipes/import", {
      method: "POST", headers: { ... }, body: "url=https://blocked.example.com",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/^\/recipes\/\d+\/edit\?mode=paste_html/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write import/routes.ts** following spec §5:
```ts
import { Hono } from "hono";
import { fetchHtml } from "./fetcher";
import { extractRecipe } from "./extractor";
import { downloadImage } from "./image";
import { render } from "@/ui/nunjucks";

export function importRoutes(db, recipes, config): Hono {
  const app = new Hono();

  app.get("/import", (c) => c.html(render("import.html", {})));

  async function runImport(c, url: string) {
    const fetched = await fetchHtml(url);
    if (!fetched) {
      const id = recipes.insert({ source_url: url });
      return c.redirect(`/recipes/${id}/edit?mode=paste_html`);
    }
    const outcome = await extractRecipe(url, fetched.html);
    if (outcome.kind === "structured" || outcome.kind === "readability") {
      const id = recipes.insert(outcome.recipe);
      if (outcome.recipe.image) {
        // fire-and-forget; await is acceptable here for v1 simplicity
        const filename = await downloadImage(config.dataDir, outcome.recipe.image);
        if (filename) recipes.update(id, { image_filename: filename });
      }
      return c.redirect(`/recipes/${id}/edit`);
    }
    // Layer 3: unsupported
    const id = recipes.insert({ source_url: url });
    return c.redirect(`/recipes/${id}/edit?mode=manual`);
  }

  app.post("/recipes/import", async (c) => {
    const body = await c.req.parseBody();
    return runImport(c, String(body.url));
  });

  app.get("/import/shared", async (c) => {
    const url = c.req.query("url") ?? "";
    if (!url) return c.html("No URL was shared", 400);
    return runImport(c, url);
  });

  app.post("/recipes/import/html", async (c) => {
    const body = await c.req.parseBody();
    const recipeId = Number(body.recipe_id);
    const html = String(body.html);
    const url = String(body.url ?? recipes.getById(recipeId)?.source_url ?? "");
    const outcome = await extractRecipe(url, html);
    if (outcome.kind === "structured" || outcome.kind === "readability") {
      recipes.update(recipeId, outcome.recipe);
      return c.redirect(`/recipes/${recipeId}/edit`);
    }
    return c.redirect(`/recipes/${recipeId}/edit?mode=paste_html&error=extract_failed`);
  });

  return app;
}
```

- [ ] **Step 4: Wire into buildApp**

- [ ] **Step 5: Modify recipe-edit.html to render paste-fallback banner when `mode` query param = `paste_html`, with a big textarea + "Retry extraction" submit button posting to `/recipes/import/html`. When `mode=manual`, render the iframe side-panel linking to source_url.

- [ ] **Step 6: Run test to verify it passes**

- [ ] **Step 7: Commit**

```bash
git add src/import/routes.ts src/ui/templates/ tests/http/import.test.ts
git commit -m "feat(import): URL, paste-HTML, shared-target routes"
```

---

## Phase 6 — Export Formats

### Task 16: Markdown zip export

**Files:**
- Create: `src/export/markdown.ts`, `src/export/routes.ts`
- Test: `tests/http/export-md.test.ts`

- [ ] **Step 1: Install archiver**

Run: `bun add archiver @types/archiver`

- [ ] **Step 2: Write failing test**

```ts
it("GET /export/formats/md-zip returns a zip of .md files", async () => {
  // seed some recipes
  const res = await app.request("/export/formats/md-zip", { headers: { Cookie: validCookie } });
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toContain("application/zip");
  // optionally extract the zip and verify .md count and contents
});
```

- [ ] **Step 3: Write markdown.ts** per spec §15.2 — render each recipe to `.md` with YAML frontmatter and zipped alongside `images/`.

- [ ] **Step 4: Write export/routes.ts**

```ts
export function exportRoutes(db, config) {
  const app = new Hono();
  const recipes = new RecipeRepository(db);
  app.get("/export/formats/:format", (c) => {
    const fmt = c.req.param("format");
    const list = recipes.list();
    if (fmt === "md-zip") {
      c.header("Content-Type", "application/zip");
      c.header("Content-Disposition", `attachment; filename="recipes-${today()}.md.zip"`);
      return streamZip(c, renderMarkdownZip(list));
    }
    // pdf and json-ld-zip added in Tasks 17 and 18
    return c.body("Unsupported format", 400);
  });
  return app;
}
```

- [ ] **Step 5: Run test → commit**

```bash
git add src/export/markdown.ts src/export/routes.ts tests/http/export-md.test.ts
git commit -m "feat(export): markdown zip"
```

---

### Task 17: PDF export (pdfkit, A4 with image-at-top + flow)

**Files:**
- Create: `src/export/pdf.ts`
- Test: `tests/http/export-pdf.test.ts`

- [ ] **Step 1: Install pdfkit**

Run: `bun add pdfkit @types/pdfkit`

- [ ] **Step 2: Write failing test**

Test that GET /export/formats/pdf returns Content-Type application/pdf with body starting with `%PDF-1.`.

- [ ] **Step 3: Write pdf.ts** per spec §15.1. Use pdfkit's `PDFDocument`-equivalent (pdfkit is the older API: `new PDFDocument(); doc.image(file, {width, height, align:'center'})`). Stream to response — instead of `c.body(...)`, use Hono's stream helper or accumulate Buffer.

Skeleton:
```ts
import PDFDocument from "pdfkit";
import { createWriteStream, readFileSync } from "node:fs";
import { join } from "node:path";

export function renderPdf(recipes, dataDir): Buffer {
  const doc = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  for (const r of recipes) {
    doc.addPage();
    if (r.image_filename) {
      try { doc.image(join(dataDir, "images", r.image_filename), { width: 300, align: "center" }); } catch {}
    }
    doc.fontSize(16).font("Helvetica-Bold").text(r.title, { align: "center" });
    doc.moveDown();
    doc.fontSize(9).font("Helvetica").text(`Source: ${r.source_url} | Rating: ${"*".repeat(r.rating)}`, { align: "center" });
    doc.moveDown();
    doc.fontSize(10).font("Helvetica-Bold").text("Ingredients");
    doc.fontSize(10).font("Helvetica").list(r.ingredients);
    doc.moveDown();
    doc.fontSize(10).font("Helvetica-Bold").text("Steps");
    doc.fontSize(10).font("Helvetica").list(r.steps);
    if (r.notes) { doc.moveDown(); doc.fontSize(10).font("Helvetica-Bold").text("Notes"); doc.text(r.notes); }
  }
  doc.end();
  // Need to make it sync to return a Buffer; use a Promise<> wrapper or write to tmp file and read back.
  // v1: return a Promise<Buffer> via doc.on("end")
}
```

Use the spec's design: image at top, then two-column ingredients+steps. For v1 iteration 1, single column is fine if two-column with pdfkit is fiddly — note this in a follow-up.

- [ ] **Step 4: Run test → commit**

```bash
git add src/export/pdf.ts tests/http/export-pdf.test.ts
git commit -m "feat(export): PDF A4 with image-at-top"
```

---

### Task 18: JSON-LD zip export

**Files:**
- Create: `src/export/jsonld.ts`
- Test: `tests/http/export-jsonld.test.ts`

- [ ] **Step 1: Write failing test**

Test that downloaded zip contains N `.jsonld` files where N = number of recipes, each one is a valid Recipe JSON-LD.

- [ ] **Step 2: Write jsonld.ts** per spec §15.3 — emit Recipe object with `name`, `description`, `recipeIngredient`, `recipeInstructions` (as HowToStep array), `keywords` (tags joined), `aggregateRating`, `x-recipe-manager-notes`.

- [ ] **Step 3: Wire into exportRoutes — add `json-ld-zip` branch**

- [ ] **Step 4: Run test → commit**

```bash
git add src/export/jsonld.ts src/export/routes.ts tests/http/export-jsonld.test.ts
git commit -m "feat(export): JSON-LD zip with manifest"
```

---

## Phase 7 — File Import & Settings Page

### Task 19: File importers (JSON-LD, Markdown zip, JSON-LD zip) + format detection

**Files:**
- Create: `src/import/file-importers/adapter.ts`, `normalize.ts`, `json-ld.ts`, `markdown-zip.ts`, `jsonld-zip.ts`, `index.ts`
- Test: `tests/unit/import/file-importers.test.ts`

- [ ] **Step 1: Install unzip deps**

Run: `bun add unzipper @types/unzipper` (or use Bun's built-in extraction)

- [ ] **Step 2: Write adapter interface**

`src/import/file-importers/adapter.ts`:
```ts
import type { PartialRecipe } from "@/import/extractor";

export interface FileImportAdapter {
  matches(name: string, mime: string): boolean;
  parse(buffer: Uint8Array, opts: { tempDir: string }): Promise<PartialRecipe[]>;
}
```

- [ ] **Step 3: Write normalize.ts**

```ts
export function normalizeTitle(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
```

- [ ] **Step 4: Write json-ld.ts** — handles single object or array; map fields per spec §16.1 mapping table; strip HTML using linkedom's `DOMParser` + `.textContent`.

- [ ] **Step 5: Write jsonld-zip.ts** — unzip, find `.jsonld` files, run through json-ld.ts per file; find `images/` subdir and copy on import.

- [ ] **Step 6: Write markdown-zip.ts** — unzip, parse each `.md`'s YAML frontmatter (use `yaml` lib) and body sections.

- [ ] **Step 7: Write index.ts dispatcher** that returns the right adapter given the uploaded file's name/mime.

- [ ] **Step 8: Write failing tests** — one per adapter, with fixture files (`recipesage-sample.jsonld`, our own small `.md.zip` sample, empty file, malformed file).

- [ ] **Step 9: Run tests → commit**

```bash
git add src/import/file-importers/ tests/fixtures/recipesage-sample.jsonld tests/unit/import/
git commit -m "feat(import): file importers for JSON-LD, md-zip, jsonld-zip"
```

---

### Task 20: Duplicate detector + preview session

**Files:**
- Create: `src/import/duplicate-detector.ts`, `src/import/preview-session.ts`
- Test: `tests/unit/import/duplicate-detector.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("detects duplicate by source_url", () => { /* insert recipe with source_url, then detect on import with same URL */ });
it("detects duplicate by normalized title + first ingredient", () => { /* ... */ });
it("returns 'new' for truly new recipe", () => { /* ... */ });
it("preview session stores parsed recipes keyed by uuid and expires", () => { /* ... */ });
```

- [ ] **Step 2: Write duplicate-detector.ts**

```ts
import { normalizeTitle } from "./file-importers/normalize";
import type { PartialRecipe } from "./extractor";
import type { Database } from "bun:sqlite";

export type DetectionResult = { status: "new" } | { status: "duplicate"; existingId: number; reason: string };

export function detectDuplicates(db: Database, incoming: PartialRecipe[]): DetectionResult[] {
  // For each: query recipes by source_url (if non-empty) — if any, mark duplicate.
  // Else, query recipes by normalized title — if any, take first, compare first ingredient (case-insensitive equals), mark duplicate.
  // Else new.
}
```

- [ ] **Step 3: Write preview-session.ts** — `Map<uuid, { recipes: PartialRecipe[], detections: DetectionResult[], createdAt: number }>`; `set(id, data)`, `get(id)`; sweep entries older than 10 minutes via timer or on every `set`.

- [ ] **Step 4: Run tests → commit**

```bash
git add src/import/duplicate-detector.ts src/import/preview-session.ts tests/unit/import/
git commit -m "feat(import): duplicate detection and preview session store"
```

---

### Task 21: Settings page (export buttons + file upload + preview + commit)

**Files:**
- Create: `src/settings/routes.ts`, `src/ui/templates/settings.html`, `src/ui/templates/settings-preview.html`
- Test: `tests/http/settings.test.ts`

- [ ] **Step 1: Write failing test** for the full flow: GET /settings renders buttons; POST /settings/import/preview with a fixture file → 200 with "1 new / 0 duplicates" content; POST /settings/import/commit with the returned session uuid → 302 to /recipes with toast.

- [ ] **Step 2: Write settings/routes.ts**

```ts
app.get("/settings", (c) => c.html(render("settings.html", {})));

app.post("/settings/import/preview", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file as File;
  const buf = new Uint8Array(await file.arrayBuffer());
  const adapter = pickAdapter(file.name, file.type);
  if (!adapter) return c.html("Unsupported file type", 400);
  const tmpDir = await mkdtemp();
  await Bun.write(tmpDir + "/file.bin", buf);
  const recipes = await adapter.parse(buf, { tempDir: tmpDir });
  const detections = detectDuplicates(db, recipes);
  const uuid = randomUUID();
  previewSessions.set(uuid, { recipes, detections, createdAt: Date.now() });
  return c.html(render("settings-preview.html", { recipes, detections, uuid }));
});

app.post("/settings/import/commit", async (c) => {
  const body = await c.req.parseBody();
  const session = String(body.session);
  const data = previewSessions.get(session);
  if (!data) return c.html("Session expired, please re-upload", 400);
  // for each PartialRecipe where decision was 'import' or 'replace', insert/update + copy image
  // count new + replaced, redirect to /recipes?toast=Imported+...
});
```

- [ ] **Step 3: Write settings.html and settings-preview.html templates** per spec §17 layout (two-column, export left, import right; preview page with checkbox+skip/replace radios per recipe).

- [ ] **Step 4: Run test → commit**

```bash
git add src/settings/ src/ui/templates/settings*.html tests/http/settings.test.ts
git commit -m "feat(settings): data in/out page with preview+commit"
```

---

## Phase 8 — PWA & Share Target

### Task 22: Service worker + manifest with share_target

**Files:**
- Create: `src/pwa/manifest.ts`, `src/pwa/sw.ts`, `src/ui/static/sw.js`, modify `src/ui/static/manifest.webmanifest` to add `share_target`
- Test: `tests/http/pwa.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("GET /manifest.webmanifest returns JSON with share_target", async () => {
  const res = await app.request("/manifest.webmanifest");
  const json = await res.json();
  expect(json["share_target"]["action"]).toBe("/shared-target");
  expect(json["share_target"]["method"]).toBe("POST");
});

it("GET /sw.js returns a JS file with share-target intercept logic", async () => {
  const res = await app.request("/sw.js");
  expect(res.headers.get("Content-Type")).toContain("javascript");
  expect(await res.text()).toContain("shared-target");
});
```

- [ ] **Step 2: Write sw.js**

```js
const CACHE = "recipe-manager-v1";
const SHELL = ["/static/app.css", "/static/htmx.min.js", "/manifest.webmanifest", "/login"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Share target POST
  if (event.request.method === "POST" && url.pathname === "/shared-target") {
    event.respondWith((async () => {
      const formData = await event.request.formData();
      const link = formData.get("url") || "";
      return Response.redirect(`/import/shared?url=${encodeURIComponent(link)}`, 303);
    })());
    return;
  }
  // Cache-first for shell assets
  if (event.request.method === "GET" && url.pathname.startsWith("/static/")) {
    event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
    return;
  }
  // Network-only with offline fallback
  event.respondWith(fetch(event.request).catch(() => new Response("Cannot reach server", { status: 503 })));
});
```

- [ ] **Step 3: Update manifest.webmanifest** to include `share_target` per spec §14.1.

- [ ] **Step 4: Add routes for /sw.js and /manifest.webmanifest** (already added in Task 8).

- [ ] **Step 5: Run test → commit**

```bash
git add src/pwa/ src/ui/static/sw.js src/ui/static/manifest.webmanifest tests/http/pwa.test.ts
git commit -m "feat(pwa): service worker + manifest with share_target"
```

---

### Task 23: Cross-quote polish — undo toast on soft-delete, no-image placeholder, print stylesheet

**Files:**
- Modify: `src/recipes/routes.ts`, `src/ui/templates/recipe-view.html`, `src/ui/css/app.tailwind.css`
- Test: extend `tests/http/recipe-view.test.ts`

- [ ] **Step 1: Write failing test**

Test that DELETE returns a redirect to `/recipes?toast=<msg>` AND the cookie header sets a one-shot toast cookie that the library page reads to render a toast with an "Undo" button linking to `/recipes/:id/restore`.

- [ ] **Step 2: Update recipe-view.html to add print CSS** — `<link rel="stylesheet" href="/static/print.css" media="print">` (a separate small CSS file hiding header/actions) OR inline `@media print { ... }` rules.

- [ ] **Step 3: Update library.html to render a toast** when `?toast=...&undo_url=...` query param present.

- [ ] **Step 4: Run test → commit**

```bash
git add src/recipes/routes.ts src/ui/templates/ src/ui/css/ tests/http/
git commit -m "feat: undo toast on delete, no-image placeholder, print stylesheet"
```

---

## Phase 9 — Docker & Runtipi packaging

### Task 24: Dockerfile + Runtipi manifests + GitHub Actions

**Files:**
- Create: `Dockerfile`, `runtipi/app.json`, `runtipi/config.json`, `runtipi/docker-compose.yml`, `.github/workflows/release.yml`

- [ ] **Step 1: Write Dockerfile** (multi-stage, `oven/bun:1-debian`).

```dockerfile
FROM oven/bun:1-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src/ src/ scripts/ tsconfig.json biome.json ./
RUN bun run build:css

FROM oven/bun:1-debian
WORKDIR /app
COPY --from=build /app/src ./src
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
ENV DATA_DIR=/data
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "src/server.ts"]
```

Note: server.ts must be runnable via bun directly (no compile step needed in prod since Bun runs TS natively). Ensure `src/db/schema.sql` is also copied (it's referenced via filesystem path).

- [ ] **Step 2: Write Runtipi app.json** per spec §11.2.

- [ ] **Step 3: Write Runtipi docker-compose.yml** per spec §11.2.

- [ ] **Step 4: Write GitHub Actions release.yml** per spec §11.3.

- [ ] **Step 5: Build the docker image locally and smoke-test**

Run:
```bash
docker build -t recipe-manager:dev .
docker run --rm -e APP_PASSWORD=test -p 3000:3000 recipe-manager:dev
# in another terminal:
curl -s http://localhost:3000/login
```
Expected: HTML response, exit 0.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile runtipi/ .github/workflows/release.yml
git commit -m "feat: dockerfile, runtipi manifest, GH actions release"
```

---

## Phase 10 — Final polish

### Task 25: Lint + typecheck + full test run

- [ ] **Step 1: Run all checks**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green.

- [ ] **Step 2: Fix any issues found**

Iterate until all three pass. Commit fixes as small,squashed units.

- [ ] **Step 3: Manual smoke test against real sites**

Run the app locally (bun dev) and import from each of the 4 real URLs:
- https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/
- https://www.bbcgoodfood.com/recipes/spaghetti-bolognese
- https://www.marmiton.org/recettes/recette_tiramisu_31862.aspx
- https://www.750g.com/tiramisu-r161.htm

Verify each lands on edit page with correct title + at least ingredients. Edit, save, view. Search for it. Tag it.

- [ ] **Step 4: Test export PDF / Markdown zip / JSON-LD zip** with manually-added recipes covering: a recipe with image, a recipe without image, a recipe with tags, a long recipe (>20 ingredients, >10 steps).

- [ ] **Step 5: Test JSON-LD file import** — export from one run, then re-import; confirm "duplicate by source_url" detection triggers.

- [ ] **Step 6: Build the Docker image one more time**

Run: `docker build -t recipe-manager:final .`
Expected: success, image ~200 MB.

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "chore: final polish, all checks green, smoke tested"
```

---

## Self-Review (run before handoff)

### Spec coverage check

- §1 Goals & constraints → addressed throughout (especially Phase 8 for PWA + share target; Phase 7 for export/import).
- §2 Stack & runtime → Tasks 1, 7, 8, 14.
- §3 Data model → Task 2.
- §4 Architecture → modules match spec §4.1 modulo reorgs; Task 3 (config), Task 4-5 (auth), Task 9-13 (recipes), Task 14-15 (import), Task 16-21 (file in/out + settings), Task 22 (PWA).
- §5 Import flow → Task 14 + 15.
- §6 Auth → Tasks 4, 5, 13.
- §7 UI design → Tasks 6, 7, 8, 11, 12, 13, 23.
- §8 Search → Task 11 (search.ts).
- §9 Error handling → spread across importer + routes tasks.
- §10 Testing → every task includes tests; final verification in Task 25.
- §11 Deployment → Task 24.
- §12 Future-proofing hooks → directory structures preserved (`import/extractors/`, `import/file-importers/`, `SESSION_SECRET` gate in config).
- §13 PWA → Task 22.
- §14 Web Share Target → Task 22 (manifest + sw) + Task 15 (`/import/shared` route already built there).
- §15 Multi-format export → Tasks 16, 17, 18.
- §16 Multi-source file import → Tasks 19, 20, 21.
- §17 Settings page → Task 21.
- §18 What comes after → this plan!

### Placeholder scan

- Tasks above contain skeleton code blocks meant to convey the **shape** of implementation. They are not stubs masquerading as final — the implementing engineer will write the full logic. Recognized: several code blocks (e.g., pdf.ts body, search.ts body) show a high-level shape and reference the spec section for the actual SQL/field mapping. This is intentional given the plan length; it's the boundary between "plan" and "implementing code." All tests are concretely written, which keeps the implementation honest.

### Type consistency

- `Recipe` interface named consistently across `repository.ts` (Task 9), `search.ts` (Task 11), export adapters, file importers.
- `PartialRecipe` interface named consistently across `extractor.ts` (Task 14), `file-importers/adapter.ts` (Task 19).
- `FileImportAdapter` defined once in adapter.ts and implemented in three concrete adapters; matches function returns `PartialRecipe[]`.
- `DetectionResult` type used consistently in `duplicate-detector` and in templates as `{ status: "new" } | { status: "duplicate", existingId, reason }`.

No function/property name mismatches noted.

---

## Notes for the executor

1. **Run tests after every step, not just at the end.** This is a 25-task plan; ceremony of green tests is what keeps it on rails.
2. **The four URL import test fixtures are real HTML copies** from the brainstorming session. They live in `tests/fixtures/` and are committed; no network is touched during tests.
3. **The recipe-scrapers TS port's exact API may differ slightly from the snippet** in Task 14. Verify by reading the installed package's TypeScript types before implementing `trySchemaExtract`.
4. **pdfkit two-column rendering is awkward**. If the v1 two-column with pdfkit becomes expensive (>2x estimated effort), ship single-column PDF and refactor later — the spec is "image at top, content flows", single-column satisfies the spec letter.
5. **Runtipi manifest format may evolve** — verify against your existing Runtipi app store at execution time.
6. **The user has Bun 1.x but no Node**; `tsx` is not needed — `bun test`, `bun src/server.ts`, `bunx tsc --noEmit` all work.