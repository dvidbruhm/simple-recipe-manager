# Multi-theme system — Phase 1 (infrastructure + dark themes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the light/dark toggle with a selectable 7-theme system (neutral + aurora, aurora-solstice, inkwell, hearth, hearth-spice, gourmet-noir), each with full character (fonts, radii, motifs) and a dark variant; switchable from the Settings page.

**Architecture:** Two-axis theming on `<html data-theme="…" data-mode="dark|light">`. Color tokens use CSS `light-dark()` resolved via `color-scheme` from `data-mode`; fonts/radii/motifs are mode-agnostic, defined once per theme. Component HTML is unchanged across themes — themes supply token values plus `[data-theme="X"]`-scoped decoration. Preference is two cookies (`theme`, `mode`), per-device. Fonts are self-hosted and precached so the PWA works offline.

**Tech Stack:** Bun · TypeScript (strict) · Hono · Nunjucks · Tailwind CSS v4 (source `src/ui/css/app.tailwind.css` → compiled `src/ui/static/app.css` via `bun run build:css`) · CSS custom properties + `light-dark()`.

**Spec:** `docs/superpowers/specs/2026-08-02-multi-theme-system-design.md`

**Phase 1 scope:** Ship infrastructure + 7 dark-selectable themes. `neutral` also works in light (existing). The 6 themed light variants are **Phase 2** (their own plan, after a mockup checkpoint). During Phase 1, themed themes in light mode defensively fall back to `neutral`+light.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `src/ui/theme.ts` | Theme id + mode types, `THEMES`/`LIGHT_READY` consts, cookie normalization, `themeVars()` returning `{ theme, mode, theme_color, theme_font }` | Rewrite |
| `src/auth/routes.ts` | `POST /theme` accepts `theme`+`mode`, validates, sets two cookies | Modify (route at ~L307) |
| `src/ui/templates/base.html` | `<html data-theme data-mode>`, font `<link>`, `<meta theme-color>`; remove header ☾ toggle | Modify |
| `src/ui/templates/settings.html` | "Appearance" gallery: 7 theme swatches + light/dark control | Modify |
| `src/settings/routes.ts` | Pass theme gallery data (`themes`, `light_ready`) into settings render | Modify (L23-32) |
| `src/ui/css/app.tailwind.css` | Two-axis `color-scheme` rules; `[data-theme="*"]` token blocks (7) with `light-dark()`; expanded token set; per-theme motif rules; drop old `[data-theme="dark"]`/`prefers-color-scheme` blocks | Modify |
| `src/ui/static/app.css` | Compiled output | Regenerate (`bun run build:css`) |
| `scripts/fetch-fonts.ts` | Download woff2 from Google Fonts; emit per-theme `/static/fonts/<theme>.css` | Create |
| `src/ui/static/fonts/*.woff2`, `*.css` | Self-hosted font files + per-theme `@font-face` CSS | Create (via script) |
| `src/ui/static/sw.js` | Bump cache to v4; precache font CSS; fix offline-page `data-*` attrs | Modify |
| `tests/unit/ui/theme.test.ts` | themeVars normalization, theme_color/theme_font maps, THEMES/LIGHT_READY | Create |
| `tests/unit/ui/css-coverage.test.ts` | Parse source CSS; assert every theme block defines every required token | Create |
| `tests/http/theme-and-autocomplete.test.ts` | `/theme` accepts theme+mode; gallery markup; base attrs; no header toggle | Modify |

**Convention notes for the engineer:** Template-facing variables use **snake_case** (`theme_color`, `theme_font`, `app_version`). Every `render()` call spreads `...themeVars(c)`, so new keys flow into `base.html` automatically — do not add manual plumbing per route. Edit CSS in `app.tailwind.css` then run `bun run build:css`; never hand-edit `app.css`.

---

## Task 1: Rewrite `src/ui/theme.ts`

**Files:**
- Modify: `src/ui/theme.ts` (full rewrite)
- Test: `tests/unit/ui/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/theme.test.ts`:

```ts
import type { Context } from "hono";
import { themeVars, THEMES, LIGHT_READY, type Theme, type Mode } from "@/ui/theme";

function ctx(cookies: Record<string, string>): Context {
	const headers = new Headers();
	for (const [k, v] of Object.entries(cookies)) headers.append("Cookie", `${k}=${v}`);
	return { req: { header: (name: string) => headers.get(name) ?? undefined } } as unknown as Context;
}

describe("themeVars", () => {
	it("defaults to neutral + dark when no cookies are present", () => {
		const v = themeVars(ctx({}));
		expect(v.theme).toBe("neutral");
		expect(v.mode).toBe("dark");
	});

	it("normalizes a legacy theme=light cookie to neutral + light", () => {
		const v = themeVars(ctx({ theme: "light" }));
		expect(v).toMatchObject({ theme: "neutral", mode: "light" });
	});

	it("normalizes a legacy theme=dark cookie to neutral + dark", () => {
		const v = themeVars(ctx({ theme: "dark" }));
		expect(v).toMatchObject({ theme: "neutral", mode: "dark" });
	});

	it("passes through a valid new theme id + mode", () => {
		const v = themeVars(ctx({ theme: "hearth", mode: "dark" }));
		expect(v).toMatchObject({ theme: "hearth", mode: "dark" });
	});

	it("falls back to neutral+light when a themed theme is requested in light before its light variant is ready", () => {
		const v = themeVars(ctx({ theme: "hearth", mode: "light" }));
		expect(v).toMatchObject({ theme: "neutral", mode: "light" });
	});

	it("rejects an unknown theme id", () => {
		const v = themeVars(ctx({ theme: "neon", mode: "dark" }));
		expect(v.theme).toBe("neutral");
	});

	it("rejects an invalid mode", () => {
		const v = themeVars(ctx({ theme: "neutral", mode: "sepia" }));
		expect(v.mode).toBe("dark");
	});

	it("always returns a theme_color and theme_font for the resolved theme+mode", () => {
		for (const t of THEMES) {
			const v = themeVars(ctx({ theme: t, mode: "dark" }));
			expect(typeof v.theme_color).toBe("string");
			expect(v.theme_color).toMatch(/^#/);
			expect(typeof v.theme_font).toBe("string");
		}
	});

	it("THEMES is exactly the 7 expected ids and LIGHT_READY initially contains only neutral", () => {
		expect(THEMES).toEqual([
			"neutral", "aurora", "aurora-solstice", "inkwell",
			"hearth", "hearth-spice", "gourmet-noir",
		]);
		expect(LIGHT_READY).toEqual(new Set<Theme>(["neutral"]));
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/unit/ui/theme.test.ts`
Expected: FAIL (imports do not exist / `THEMES` undefined).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/ui/theme.ts` with:

```ts
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export const THEMES = [
	"neutral", "aurora", "aurora-solstice", "inkwell",
	"hearth", "hearth-spice", "gourmet-noir",
] as const;
export type Theme = (typeof THEMES)[number];

export type Mode = "light" | "dark";

/** Themes whose light variant is shipped. Others fall back to neutral+light. Grows in Phase 2. */
export const LIGHT_READY: Set<Theme> = new Set<Theme>(["neutral"]);

const DEFAULT_THEME: Theme = "neutral";
const DEFAULT_MODE: Mode = "dark";

/** <meta name="theme-color"> per theme × mode (PWA chrome). */
const THEME_COLOR: Record<Theme, Record<Mode, string>> = {
	neutral:         { light: "#f1f1ef", dark: "#161617" },
	aurora:          { light: "#f4f6fb", dark: "#0b0e14" },
	"aurora-solstice": { light: "#faf6f0", dark: "#100c08" },
	inkwell:         { light: "#ffffff", dark: "#000000" },
	hearth:          { light: "#f7f2ea", dark: "#1f1a16" },
	"hearth-spice":  { light: "#faf3ea", dark: "#1f1410" },
	"gourmet-noir":  { light: "#f9f4ea", dark: "#15120e" },
};

/** Google Fonts CSS2 URL per theme (Task 9 swaps these for self-hosted /static/fonts/<theme>.css). */
const FONT_URL: Record<Theme, string> = {
	neutral: "",
	aurora: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
	"aurora-solstice": "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
	inkwell: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
	hearth: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"hearth-spice": "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"gourmet-noir": "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&display=swap",
};

export interface ThemeVars {
	theme: Theme;
	mode: Mode;
	theme_color: string;
	theme_font: string;
}

function isTheme(v: string | undefined): v is Theme {
	return !!v && (THEMES as readonly string[]).includes(v);
}

function normalizeTheme(raw: string | undefined): { theme: Theme; mode: Mode } {
	// Legacy: the old cookie held "light" | "dark" (a mode, not a theme id).
	if (raw === "light" || raw === "dark") {
		return { theme: DEFAULT_THEME, mode: raw };
	}
	let theme: Theme = isTheme(raw) ? raw : DEFAULT_THEME;
	let modeCookie = ""; // resolved by caller via getCookie below
	return { theme, mode: modeCookie as Mode }; // mode patched in themeVars
}

export function themeVars(c: Context): ThemeVars {
	const rawTheme = getCookie(c, "theme");
	const rawMode = getCookie(c, "mode");

	let theme: Theme;
	let mode: Mode;

	if (rawTheme === "light" || rawTheme === "dark") {
		theme = DEFAULT_THEME;
		mode = rawTheme;
	} else {
		theme = isTheme(rawTheme) ? rawTheme : DEFAULT_THEME;
		mode = rawMode === "light" || rawMode === "dark" ? rawMode : DEFAULT_MODE;
	}

	// Unsupported-combo fallback: a themed theme in light mode before its light variant ships.
	if (mode === "light" && !LIGHT_READY.has(theme)) {
		theme = DEFAULT_THEME;
	}

	return {
		theme,
		mode,
		theme_color: THEME_COLOR[theme][mode],
		theme_font: FONT_URL[theme],
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/unit/ui/theme.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: no errors. (If other call sites break on the removed `next_theme`/`theme_icon` exports, leave them — they are fixed in Task 3. Do not commit until Task 3 typechecks cleanly. If typecheck noise blocks you, proceed to Task 2 then Task 3 and typecheck once at the end of Task 3.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.ts tests/unit/ui/theme.test.ts
git commit -m "feat(ui): theme id + mode selection with cookie normalization"
```

---

## Task 2: Update `POST /theme` route

**Files:**
- Modify: `src/auth/routes.ts` (the `app.post("/theme", …)` handler around L307)
- Test: `tests/http/theme-and-autocomplete.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/http/theme-and-autocomplete.test.ts`, replace the entire `describe("POST /theme", …)` block (currently L80-120) with:

```ts
	describe("POST /theme", () => {
		it("sets theme + mode cookies and redirects to the Referer", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Referer: "/recipes",
					Cookie: `session=${cookie}`,
				},
				body: "theme=hearth&mode=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location")).toBe("/recipes");
			const setCookie = res.headers.get("Set-Cookie") ?? "";
			expect(setCookie).toMatch(/theme=hearth/);
			expect(setCookie).toMatch(/mode=dark/);
		});

		it("rejects an unknown theme value with 400", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: `session=${cookie}` },
				body: "theme=neon&mode=dark",
			});
			expect(res.status).toBe(400);
		});

		it("rejects an invalid mode with 400", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: `session=${cookie}` },
				body: "theme=aurora&mode=sepia",
			});
			expect(res.status).toBe(400);
		});

		it("requires auth (redirects to /login without a session)", async () => {
			const { app } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: "theme=aurora&mode=dark",
			});
			expect(res.status).toBe(302);
			expect(res.headers.get("location") ?? "").toContain("/login");
		});
	});
```

Also **delete** the entire `describe("header theme cycle button", …)` block (currently L122-140) — that UI is removed in Task 3. Leave the autocomplete and image-serving describes untouched.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: FAIL (the `/theme` route still expects `theme=dark` and returns 400/old behavior; header-cycle tests are gone so those no longer run).

- [ ] **Step 3: Update the route**

In `src/auth/routes.ts`, add the imports at the top (alongside the existing `themeVars` import):

```ts
import { THEMES, type Mode } from "@/ui/theme";
```

Replace the `app.post("/theme", …)` handler (around L307-318) with:

```ts
	app.post("/theme", async (c) => {
		const body = await c.req.parseBody();
		const theme = String(body.theme ?? "");
		const mode = String(body.mode ?? "");
		const validTheme = (THEMES as readonly string[]).includes(theme);
		const validMode = mode === "light" || mode === "dark";
		if (!validTheme || !validMode) return c.body("Bad theme", 400);
		const opts = { httpOnly: false, sameSite: "Lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };
		setCookie(c, "theme", theme, opts);
		setCookie(c, "mode", mode, opts);
		return c.redirect(c.req.header("Referer") ?? "/recipes");
	});
```

Ensure `setCookie` is already imported from `hono/cookie` (it is — the existing handler uses it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: POST `/theme` tests PASS. (Header-cycle tests no longer exist; autocomplete + image tests still PASS.)

- [ ] **Step 5: Commit**

```bash
git add src/auth/routes.ts tests/http/theme-and-autocomplete.test.ts
git commit -m "feat(ui): /theme accepts theme + mode and sets both cookies"
```

---

## Task 3: Wire `base.html` (two-axis attrs, font link, remove header toggle)

**Files:**
- Modify: `src/ui/templates/base.html`
- Modify: `src/ui/css/app.tailwind.css` (remove now-unused `.theme-form` / `.theme-toggle` rules around L75-81)
- Test: `tests/http/theme-and-autocomplete.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new describe block to `tests/http/theme-and-autocomplete.test.ts` (anywhere inside the top-level `describe`):

```ts
	describe("base layout theme wiring", () => {
		it("renders data-theme + data-mode on <html> and a theme-color meta", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie, { Cookie: `theme=aurora; mode=dark; session=${cookie}` }));
			const body = await res.text();
			expect(body).toContain('data-theme="aurora"');
			expect(body).toContain('data-mode="dark"');
			expect(body).toContain('name="theme-color"');
		});

		it("no longer renders the header theme-toggle form", async () => {
			const { app } = await setupApp();
			const res = await app.request("/login");
			const body = await res.text();
			expect(body).not.toContain('class="btn theme-toggle"');
			expect(body).not.toContain('aria-label="Toggle theme"');
		});

		it("renders the active theme's font <link>", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie, { Cookie: `theme=hearth; mode=dark; session=${cookie}` }));
			const body = await res.text();
			expect(body).toContain('rel="stylesheet" href="https://fonts.googleapis.com/css2');
		});
	});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: FAIL (root still has `data-theme="{{ theme }}"` only; header toggle still present).

- [ ] **Step 3: Edit `base.html`**

Change the root element (L2) from:

```html
<html lang="en" data-theme="{{ theme | default('dark') }}">
```
to:
```html
<html lang="en" data-theme="{{ theme | default('neutral') }}" data-mode="{{ mode | default('dark') }}">
```

In `<head>`, replace the `<meta name="theme-color" …>` line (L11) with:

```html
  <meta name="theme-color" content="{{ theme_color | default('#161617') }}">
```

Just under the `app.css` `<link>` (L7), add the font link (only when a theme font is set):

```html
  {% if theme_font %}<link rel="stylesheet" href="{{ theme_font }}">{% endif %}
```

Remove the entire theme-toggle form (L20-23):

```html
    <form method="post" action="/theme" class="theme-form">
      <input type="hidden" name="theme" value="{{ next_theme | default('dark') }}">
      <button type="submit" class="btn theme-toggle" aria-label="Toggle theme">{{ theme_icon | default('☀') }}</button>
    </form>
```

Leave the PWA install button and settings gear in place.

- [ ] **Step 4: Remove dead CSS**

In `src/ui/css/app.tailwind.css`, delete the `.site-header .theme-form { … }` and `.site-header .theme-toggle { … }` rules (around L75-81).

- [ ] **Step 5: Rebuild CSS**

Run: `bun run build:css`
Expected: writes `src/ui/static/app.css` with no error.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: PASS (including the new `base layout theme wiring` block).

- [ ] **Step 7: Typecheck and lint**

Run: `bun run typecheck && bun run lint`
Expected: clean (removing `next_theme`/`theme_icon` from `themeVars` no longer breaks anything now that base.html doesn't reference them).

- [ ] **Step 8: Commit**

```bash
git add src/ui/templates/base.html src/ui/css/app.tailwind.css src/ui/static/app.css tests/http/theme-and-autocomplete.test.ts
git commit -m "feat(ui): two-axis data-theme/data-mode on <html>, font link, drop header toggle"
```

---

## Task 4: CSS token-coverage test (red)

**Files:**
- Test: `tests/unit/ui/css-coverage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ui/css-coverage.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, type Theme } from "@/ui/theme";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(__dirname, "..", "..", "..", "src", "ui", "css", "app.tailwind.css");

const REQUIRED_TOKENS = [
	"--color-bg", "--color-surface", "--color-elevated", "--color-text", "--color-muted",
	"--color-accent", "--color-accent-soft", "--color-border", "--color-danger",
	"--color-favorite", "--color-star",
	"--font-display", "--font-body",
	"--radius-card", "--radius-control", "--radius-pill",
	"--shadow-card", "--shadow-hover", "--ring",
] as const;

const COLOR_TOKENS = [
	"--color-bg", "--color-surface", "--color-elevated", "--color-text", "--color-muted",
	"--color-accent", "--color-accent-soft", "--color-border", "--color-danger",
	"--color-favorite", "--color-star",
] as const;

function blockFor(css: string, theme: Theme): string {
	const start = css.indexOf(`[data-theme="${theme}"]`);
	if (start === -1) return "";
	let depth = 0;
	let i = css.indexOf("{", start);
	const from = i;
	for (; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") { depth--; if (depth === 0) break; }
	}
	return css.slice(from, i);
}

describe("CSS theme coverage", () => {
	const css = readFileSync(CSS_PATH, "utf8");

	it("declares color-scheme rules for both data-mode values", () => {
		expect(css).toMatch(/\[data-mode="light"\]\s*\{[^}]*color-scheme:\s*light/);
		expect(css).toMatch(/\[data-mode="dark"\]\s*\{[^}]*color-scheme:\s*dark/);
	});

	for (const theme of THEMES) {
		describe(`theme: ${theme}`, () => {
			it("has a [data-theme] block", () => {
				expect(css).toContain(`[data-theme="${theme}"]`);
			});

			it("defines every required token", () => {
				const block = blockFor(css, theme);
				for (const token of REQUIRED_TOKENS) {
					expect(block, `${theme} missing ${token}`).toContain(token);
				}
			});

			it("uses light-dark() for every color token", () => {
				const block = blockFor(css, theme);
				for (const token of COLOR_TOKENS) {
					const idx = block.indexOf(token);
					const decl = block.slice(idx, idx + 200);
					expect(decl, `${theme} ${token} should use light-dark()`).toContain("light-dark(");
				}
			});
		});
	}
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/unit/ui/css-coverage.test.ts`
Expected: FAIL (no `[data-theme="neutral"]` block; old `[data-theme="dark"]` only; no `light-dark()`; missing tokens).

This is the red state for Tasks 5 and 6.

- [ ] **Step 3: Commit (red test)**

```bash
git add tests/unit/ui/css-coverage.test.ts
git commit -m "test(ui): add CSS theme token-coverage test (red)"
```

---

## Task 5: Two-axis plumbing + expanded token set + neutral theme

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (top of file: `@theme` block + the old `[data-theme="dark"]`/`prefers-color-scheme` blocks)

- [ ] **Step 1: Replace the top token section**

In `src/ui/css/app.tailwind.css`, replace lines 1-39 (the `@import`, `@theme {…}`, `@custom-variant`, `[data-theme="dark"]{…}`, and `@media (prefers-color-scheme: dark){…}` blocks) with:

```css
@import "tailwindcss";

@theme {
	--color-bg: #f1f1ef;
	--color-surface: #ffffff;
	--color-elevated: #ffffff;
	--color-text: #1a1a1a;
	--color-muted: #6b6b6b;
	--color-accent: #5a7a4f;
	--color-accent-soft: rgba(90, 122, 79, 0.10);
	--color-border: #d8d8d4;
	--color-danger: #c0392b;
	--color-favorite: #d6453a;
	--color-star: #c9a227;
	--font-display: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	--font-body: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	--radius-card: 8px;
	--radius-control: 6px;
	--radius-pill: 999px;
	--shadow-card: 0 1px 2px rgba(0, 0, 0, 0.06);
	--shadow-hover: 0 4px 12px rgba(0, 0, 0, 0.10);
	--ring: 0 0 0 2px var(--color-accent);
}

@custom-variant dark (&:where(.dark, .dark *));

/* Two-axis theming: data-mode drives color-scheme, which resolves light-dark(). */
[data-mode="light"] { color-scheme: light; }
[data-mode="dark"]  { color-scheme: dark; }

[data-theme="neutral"] {
	--color-bg:        light-dark(#f1f1ef, #161617);
	--color-surface:   light-dark(#ffffff, #2d2d33);
	--color-elevated:  light-dark(#ffffff, #353539);
	--color-text:      light-dark(#1a1a1a, #e8e8e6);
	--color-muted:     light-dark(#6b6b6b, #9a9a9a);
	--color-accent:    light-dark(#5a7a4f, #94b386);
	--color-accent-soft: light-dark(rgba(90,122,79,0.10), rgba(148,179,134,0.14));
	--color-border:    light-dark(#d8d8d4, #3a3a40);
	--color-danger:    light-dark(#c0392b, #e57373);
	--color-favorite:  light-dark(#d6453a, #ff5a5a);
	--color-star:      light-dark(#c9a227, #e0b83a);
	--font-display:    -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	--font-body:       -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
	--radius-card:     8px;
	--radius-control:  6px;
	--radius-pill:     999px;
	--shadow-card:     light-dark(0 1px 2px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.4));
	--shadow-hover:    light-dark(0 4px 12px rgba(0,0,0,0.10), 0 6px 18px rgba(0,0,0,0.5));
	--ring:            0 0 0 2px var(--color-accent);
}
```

- [ ] **Step 2: Make `body` consume the font token**

Still in `app.tailwind.css`, find the `body { … }` rule (around L41-49) and change the hardcoded `font-family` line to:

```css
	font-family: var(--font-body);
```

- [ ] **Step 3: Rebuild CSS**

Run: `bun run build:css`
Expected: writes `app.css`, no error.

- [ ] **Step 4: Run the coverage test — neutral should now pass**

Run: `bun test tests/unit/ui/css-coverage.test.ts`
Expected: the `theme: neutral` describes PASS; the `color-scheme` test PASS; the other 6 themes still FAIL (no blocks yet).

- [ ] **Step 5: Commit**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat(ui): two-axis color-scheme plumbing, expanded tokens, neutral theme"
```

---

## Task 6: Add the 6 themed token blocks

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (append after the `[data-theme="neutral"]` block)

- [ ] **Step 1: Append the 6 theme blocks**

Append the following immediately after the `[data-theme="neutral"] { … }` block:

```css
[data-theme="aurora"] {
	--color-bg:        light-dark(#f4f6fb, #0b0e14);
	--color-surface:   light-dark(#ffffff, #131720);
	--color-elevated:  light-dark(#f8f9fc, #171c28);
	--color-text:      light-dark(#0f1320, #e6e8ec);
	--color-muted:     light-dark(#5b6478, #8b93a7);
	--color-accent:    light-dark(#4f46e5, #6366f1);
	--color-accent-soft: light-dark(rgba(79,70,229,0.10), rgba(99,102,241,0.14));
	--color-border:    light-dark(rgba(15,19,32,0.10), rgba(255,255,255,0.08));
	--color-danger:    light-dark(#dc2626, #f87171);
	--color-favorite:  light-dark(#e11d48, #fb7185);
	--color-star:      light-dark(#b45309, #fbbf24);
	--font-display:    "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--font-body:       "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--radius-card:     12px;
	--radius-control:  10px;
	--radius-pill:     999px;
	--shadow-card:     light-dark(0 1px 2px rgba(15,19,32,0.06), 0 1px 2px rgba(0,0,0,0.4));
	--shadow-hover:    light-dark(0 8px 24px rgba(15,19,32,0.10), 0 8px 24px rgba(0,0,0,0.45));
	--ring:            0 0 0 1px var(--color-accent), 0 0 16px light-dark(rgba(79,70,229,0.35), rgba(99,102,241,0.45));
}

[data-theme="aurora-solstice"] {
	--color-bg:        light-dark(#faf6f0, #100c08);
	--color-surface:   light-dark(#ffffff, #1a1410);
	--color-elevated:  light-dark(#fdfaf5, #211b15);
	--color-text:      light-dark(#2a2018, #f0e8de);
	--color-muted:     light-dark(#8a7d6c, #9a8f80);
	--color-accent:    light-dark(#ea580c, #f97316);
	--color-accent-soft: light-dark(rgba(234,88,12,0.10), rgba(249,115,22,0.14));
	--color-border:    light-dark(rgba(42,32,24,0.10), rgba(255,255,255,0.08));
	--color-danger:    light-dark(#dc2626, #ef4444);
	--color-favorite:  light-dark(#e11d48, #fb7185);
	--color-star:      light-dark(#b45309, #fbbf24);
	--font-display:    "Sora", "Inter", -apple-system, system-ui, sans-serif;
	--font-body:       "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--radius-card:     12px;
	--radius-control:  10px;
	--radius-pill:     999px;
	--shadow-card:     light-dark(0 1px 2px rgba(60,40,20,0.06), 0 1px 2px rgba(0,0,0,0.4));
	--shadow-hover:    light-dark(0 8px 24px rgba(60,40,20,0.10), 0 8px 24px rgba(0,0,0,0.45));
	--ring:            0 0 0 1px var(--color-accent), 0 0 16px light-dark(rgba(234,88,12,0.35), rgba(249,115,22,0.45));
}

[data-theme="inkwell"] {
	--color-bg:        light-dark(#ffffff, #000000);
	--color-surface:   light-dark(#f5f5f5, #0a0a0a);
	--color-elevated:  light-dark(#ffffff, #0f0f0f);
	--color-text:      light-dark(#000000, #ffffff);
	--color-muted:     light-dark(#6a6a6a, #6a6a6a);
	--color-accent:    light-dark(#000000, #ffffff);
	--color-accent-soft: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.08));
	--color-border:    light-dark(#e4e4e4, #1f1f1f);
	--color-danger:    light-dark(#000000, #ffffff);
	--color-favorite:  light-dark(#000000, #ffffff);
	--color-star:      light-dark(#000000, #ffffff);
	--font-display:    "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--font-body:       "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--font-mono:       "IBM Plex Mono", ui-monospace, monospace;
	--radius-card:     2px;
	--radius-control:  2px;
	--radius-pill:     2px;
	--shadow-card:     none;
	--shadow-hover:    none;
	--ring:            0 0 0 2px var(--color-text);
}

[data-theme="hearth"] {
	--color-bg:        light-dark(#f7f2ea, #1f1a16);
	--color-surface:   light-dark(#fffaf2, #2a221c);
	--color-elevated:  light-dark(#fffdf8, #332a22);
	--color-text:      light-dark(#2c241c, #e8dcc8);
	--color-muted:     light-dark(#8a7d6a, #9a8b7a);
	--color-accent:    light-dark(#5f7a52, #8aa67a);
	--color-accent-soft: light-dark(rgba(95,122,82,0.12), rgba(138,166,122,0.16));
	--color-border:    light-dark(#e0d4c2, #44382d);
	--color-danger:    light-dark(#b15a3a, #c97a4a);
	--color-favorite:  light-dark(#b15a3a, #c97a4a);
	--color-star:      light-dark(#b8862b, #d2b483);
	--font-display:    "Fraunces", Georgia, serif;
	--font-body:       "Nunito", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--radius-card:     28px;
	--radius-control:  18px;
	--radius-pill:     999px;
	--shadow-card:     light-dark(0 6px 20px rgba(60,40,30,0.08), 0 6px 20px rgba(0,0,0,0.30));
	--shadow-hover:    light-dark(0 10px 30px rgba(60,40,30,0.12), 0 10px 30px rgba(0,0,0,0.40));
	--ring:            0 0 0 2px var(--color-accent);
}

[data-theme="hearth-spice"] {
	--color-bg:        light-dark(#faf3ea, #1f1410);
	--color-surface:   light-dark(#fff8ef, #2a1c16);
	--color-elevated:  light-dark(#fffdf8, #33241c);
	--color-text:      light-dark(#2e1f15, #f2e6d3);
	--color-muted:     light-dark(#8c7560, #a08a72);
	--color-accent:    light-dark(#c24a25, #d2603a);
	--color-accent-soft: light-dark(rgba(194,74,37,0.12), rgba(210,96,58,0.16));
	--color-border:    light-dark(#e4d4c0, #4a342a);
	--color-danger:    light-dark(#b03a1a, #d2603a);
	--color-favorite:  light-dark(#a06a1a, #e0a82e);
	--color-star:      light-dark(#a06a1a, #e0a82e);
	--font-display:    "Fraunces", Georgia, serif;
	--font-body:       "Nunito", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--radius-card:     24px;
	--radius-control:  16px;
	--radius-pill:     999px;
	--shadow-card:     light-dark(0 6px 20px rgba(60,40,30,0.08), 0 6px 20px rgba(0,0,0,0.30));
	--shadow-hover:    light-dark(0 10px 30px rgba(60,40,30,0.12), 0 10px 30px rgba(0,0,0,0.40));
	--ring:            0 0 0 2px var(--color-accent);
}

[data-theme="gourmet-noir"] {
	--color-bg:        light-dark(#f9f4ea, #15120e);
	--color-surface:   light-dark(#fffdf7, #1d1812);
	--color-elevated:  light-dark(#fffdf9, #241e16);
	--color-text:      light-dark(#2a2014, #ece4d3);
	--color-muted:     light-dark(#8a7c63, #8a7e63);
	--color-accent:    light-dark(#a07a2e, #d4b483);
	--color-accent-soft: light-dark(rgba(160,122,46,0.12), rgba(212,180,131,0.14));
	--color-border:    light-dark(#e2d6c0, #3a3128);
	--color-danger:    light-dark(#a8472b, #c97a4a);
	--color-favorite:  light-dark(#a8472b, #c97a4a);
	--color-star:      light-dark(#a07a2e, #d4b483);
	--font-display:    "Playfair Display", Georgia, serif;
	--font-body:       "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
	--radius-card:     2px;
	--radius-control:  2px;
	--radius-pill:     2px;
	--shadow-card:     light-dark(0 1px 3px rgba(60,40,30,0.08), 0 1px 3px rgba(0,0,0,0.4));
	--shadow-hover:    light-dark(0 6px 18px rgba(60,40,30,0.12), 0 6px 18px rgba(0,0,0,0.45));
	--ring:            0 0 0 2px var(--color-accent);
}
```

- [ ] **Step 2: Rebuild CSS**

Run: `bun run build:css`
Expected: writes `app.css`, no error.

- [ ] **Step 3: Run the coverage test — all themes should now pass**

Run: `bun test tests/unit/ui/css-coverage.test.ts`
Expected: PASS (all 7 themes × 3 assertions + color-scheme test).

- [ ] **Step 4: Commit**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat(ui): add aurora, solstice, inkwell, hearth, spice, gourmet theme tokens"
```

---

## Task 7: Per-theme signature motifs

**Files:**
- Modify: `src/ui/css/app.tailwind.css` (append a motifs section)

Motifs are decorative rules scoped to `[data-theme="X"]`. They sit on top of the stable component classes already in the templates (`.card`, `.tag-chip`, `.description`, `.notes`, `.ingredients`, plus `h1`/`h2`/`h3`).

- [ ] **Step 1: Append the motifs section**

Append at the end of `app.tailwind.css`:

```css
/* ───────────────────────── Theme motifs (Level C) ───────────────────────── */

/* Focus uses the theme ring token everywhere (already the default via :focus-visible below). */
*:focus-visible { outline: none; box-shadow: var(--ring); }

/* aurora + aurora-solstice: glassy surfaces + glow ring (ring is the glow via --ring token). */
[data-theme="aurora"] .card,
[data-theme="aurora-solstice"] .card {
	box-shadow: var(--shadow-card), light-dark(inset 0 0 0 transparent, inset 0 1px 0 rgba(255,255,255,0.04));
}

/* inkwell: monochrome — desaturate photography; mono small-caps section labels. */
[data-theme="inkwell"] img { filter: grayscale(1) contrast(1.05); }
[data-theme="inkwell"] h2,
[data-theme="inkwell"] h3 {
	font-family: var(--font-mono), ui-monospace, monospace;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	font-size: 0.8rem;
	font-weight: 500;
}

/* hearth: hand-drawn squiggle under section headings + leaf bullets in ingredient lists. */
[data-theme="hearth"] h2 { position: relative; padding-bottom: 0.6rem; }
[data-theme="hearth"] h2::after {
	content: "";
	position: absolute; left: 0; bottom: 0;
	width: 3rem; height: 0.45rem;
	background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 8' fill='none' stroke='%238aa67a' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M2 5 Q 8 1 14 5 T 26 5 T 38 5 T 50 5 T 58 5'/%3E%3C/svg%3E") no-repeat center / contain;
}
[data-theme="hearth"] .ingredients li { list-style: none; }
[data-theme="hearth"] .ingredients li::before { content: "\1F33F"; margin-right: 0.4rem; }

/* hearth-spice: tile-pattern top band on cards + diamond stamp before chips/labels. */
[data-theme="hearth-spice"] .card { position: relative; border-width: 1px; }
[data-theme="hearth-spice"] .card::before {
	content: ""; display: block; height: 8px;
	background: repeating-linear-gradient(45deg, var(--color-accent) 0 6px, transparent 6px 12px);
}
[data-theme="hearth-spice"] .tag-chip::before { content: "\25C6"; margin-right: 0.3rem; color: var(--color-accent); }

/* gourmet-noir: drop caps, ornament dividers, small-caps eyebrows, pull-quote notes. */
[data-theme="gourmet-noir"] .description::first-letter,
[data-theme="gourmet-noir"] .notes p::first-letter {
	font-family: var(--font-display);
	font-size: 3rem; line-height: 0.9; float: left;
	padding: 0.1rem 0.4rem 0 0; color: var(--color-accent);
}
[data-theme="gourmet-noir"] h2 { text-align: left; }
[data-theme="gourmet-noir"] .site-main h2::after {
	content: "  \2766"; color: var(--color-accent); opacity: 0.7; font-weight: 400;
}
[data-theme="gourmet-noir"] h3 {
	font-variant: small-caps; letter-spacing: 0.04em;
}
[data-theme="gourmet-noir"] .notes {
	border-left: 3px solid var(--color-accent); padding-left: 1rem; font-style: italic;
}
```

- [ ] **Step 2: Rebuild CSS**

Run: `bun run build:css`
Expected: writes `app.css`, no error.

- [ ] **Step 3: Visual check (dark mode)**

Run the dev server (`SESSION_SECRET=dev APP_BASE_URL=http://localhost:3000 SMTP_HOST=127.0.0.1 SMTP_FROM=noreply@localhost bun run dev`), then set each theme cookie via the Settings page (Task 8 lands the picker; until then you can `curl -X POST -d "theme=<id>&mode=dark"` with a session cookie, or just wait until after Task 8). Spot-check that motifs render: aurora glow on focus, inkwell grayscale + mono labels, hearth squiggle + leaf bullets, spice tile band + diamond chips, gourmet drop cap + ornament. Fix any selector that misses (the stable hooks are `.card`, `.tag-chip`, `.description`, `.notes`, `.ingredients`).

- [ ] **Step 4: Commit**

```bash
git add src/ui/css/app.tailwind.css src/ui/static/app.css
git commit -m "feat(ui): per-theme signature motifs (glow, squiggle, tile, drop cap, etc.)"
```

---

## Task 8: Settings Appearance gallery

**Files:**
- Modify: `src/settings/routes.ts` (L23-32, the `GET /settings` handler)
- Modify: `src/ui/templates/settings.html` (add an Appearance card at the top of `<section>`)
- Test: `tests/http/theme-and-autocomplete.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block to `tests/http/theme-and-autocomplete.test.ts`:

```ts
	describe("Settings appearance gallery", () => {
		it("renders all 7 theme swatches and a light/dark control", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie));
			const body = await res.text();
			for (const id of ["neutral","aurora","aurora-solstice","inkwell","hearth","hearth-spice","gourmet-noir"]) {
				expect(body).toContain(`data-theme-id="${id}"`);
			}
			expect(body).toContain('name="mode"');
			expect(body).toContain('value="dark"');
			expect(body).toContain('value="light"');
		});

		it("marks the active theme and disables light for themes without a light variant", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie, { Cookie: `theme=hearth; mode=dark; session=${cookie}` }));
			const body = await res.text();
			expect(body).toContain('data-theme-id="hearth" aria-current="true"');
			// light option carries the disabled marker for non-ready themes
			expect(body).toContain('data-mode-light-disabled');
		});

		it("posts theme + mode to /theme from the gallery form", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/theme", {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: `session=${cookie}` },
				body: "theme=inkwell&mode=dark",
			});
			expect(res.status).toBe(302);
		});
	});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: FAIL (no `data-theme-id` markup yet).

- [ ] **Step 3: Pass gallery data from the settings route**

In `src/settings/routes.ts`, add to the imports at the top:

```ts
import { THEMES, LIGHT_READY, type Theme } from "@/ui/theme";
```

Replace the `GET /settings` handler (L23-32) with:

```ts
	app.get("/settings", (c) => {
		const vars = themeVars(c);
		return c.html(
			render("settings.html", {
				...vars,
				title: "Settings",
				app_version: APP_VERSION,
				github_url: GITHUB_URL,
				themes: THEMES.map((id) => ({
					id,
					light_ready: LIGHT_READY.has(id as Theme),
				})),
			}),
		);
	});
```

- [ ] **Step 4: Add the Appearance card to `settings.html`**

Open `src/ui/templates/settings.html`. Immediately after the opening `<section class="settings-page max-w-3xl mx-auto px-4">` and the existing `<h1>…</h1>`/intro `<p>`, insert this card **before** the first `settings-card`:

```html
  <div class="settings-card rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 mb-5">
    <h2 class="text-lg font-semibold text-[color:var(--color-text)] mb-1">Appearance</h2>
    <p class="text-sm text-[color:var(--color-muted)] mb-4">Pick a theme. Each has its own colors, type, and detailing.</p>
    <form action="/theme" method="post" class="theme-gallery">
      <input type="hidden" name="mode" value="{{ mode | default('dark') }}" id="theme-mode">
      <div class="theme-swatches grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 mb-4">
        {% for t in themes %}
        <button type="submit" name="theme" value="{{ t.id }}"
                class="theme-swatch block text-left p-3 rounded border bg-[color:var(--color-bg)]"
                style="--sw-accent: var(--accent-{{ t.id }}); border-color: var(--color-border)"
                data-theme-id="{{ t.id }}"
                {% if t.id == theme %}aria-current="true"{% endif %}>
          <span class="block font-medium text-[color:var(--color-text)]">{{ t.id }}</span>
          <span class="block text-xs text-[color:var(--color-muted)] mt-1">{{ t.light_ready ? "light + dark" : "dark" }}</span>
        </button>
        {% endfor %}
      </div>
      <div class="flex gap-2" role="group" aria-label="Color mode">
        <button type="button" class="btn theme-mode-btn" data-mode-set="dark"
                onclick="document.getElementById('theme-mode').value='dark'; this.form.requestSubmit()">☾ Dark</button>
        <button type="button" class="btn theme-mode-btn" data-mode-set="light"
                {% if not light_ready_for_theme %}data-mode-light-disabled{% endif %}
                onclick="document.getElementById('theme-mode').value='light'; this.form.requestSubmit()">☀ Light</button>
      </div>
    </form>
  </div>
```

Then, to make `light_ready_for_theme` resolve, change the `data-mode-light-disabled` line to gate on the *active* theme's readiness. Replace the Light button block with:

```html
        <button type="button" class="btn theme-mode-btn"
                {% set active_light_ready = false %}
                {% for t in themes %}{% if t.id == theme and t.light_ready %}{% set active_light_ready = true %}{% endif %}{% endfor %}
                {% if not active_light_ready %}disabled data-mode-light-disabled title="Light variant not available yet for this theme"{% endif %}
                onclick="document.getElementById('theme-mode').value='light'; this.form.requestSubmit()">☀ Light</button>
```

- [ ] **Step 5: Add minimal gallery styles**

Append to `src/ui/css/app.tailwind.css`:

```css
.theme-swatch[aria-current="true"] {
	border-color: var(--color-accent) !important;
	box-shadow: var(--ring);
}
.theme-mode-btn { flex: 0 0 auto; }
```

Rebuild: `bun run build:css`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test tests/http/theme-and-autocomplete.test.ts`
Expected: the `Settings appearance gallery` block PASS.

- [ ] **Step 7: Commit**

```bash
git add src/settings/routes.ts src/ui/templates/settings.html src/ui/css/app.tailwind.css src/ui/static/app.css tests/http/theme-and-autocomplete.test.ts
git commit -m "feat(ui): Settings appearance gallery with 7 theme swatches + mode control"
```

---

## Task 9: Self-host fonts + service worker precache

**Goal:** Stop depending on the Google Fonts CDN; download woff2 files, serve per-theme `@font-face` CSS from `/static/fonts/<theme>.css`, and precache them so any theme works offline.

**Files:**
- Create: `scripts/fetch-fonts.ts`
- Create: `src/ui/static/fonts/<theme>.css` (generated for the 6 themed themes)
- Create: `src/ui/static/fonts/*.woff2` (downloaded)
- Modify: `src/ui/theme.ts` (swap `FONT_URL` values to local paths)
- Modify: `src/ui/static/sw.js` (bump cache, precache font CSS, fix offline-page attrs)

- [ ] **Step 1: Create the font-fetch script**

Create `scripts/fetch-fonts.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "ui", "static", "fonts");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const THEME_FONTS: Record<string, string> = {
	aurora: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
	"aurora-solstice": "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
	inkwell: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
	hearth: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"hearth-spice": "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"gourmet-noir": "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&display=swap",
};

let slugCounter = 0;
function nextSlug(family: string, weight: string, style: string): string {
	slugCounter++;
	const f = family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
	return `${f}-${weight}${style === "italic" ? "-italic" : ""}-${slugCounter}`;
}

async function buildTheme(theme: string, cssUrl: string): Promise<string> {
	const resp = await fetch(cssUrl, { headers: { "User-Agent": UA } });
	if (!resp.ok) throw new Error(`fetch ${theme} css: ${resp.status}`);
	let css = await resp.text();

	const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
	let match: RegExpExecArray | null;
	while ((match = urlRe.exec(css)) !== null) {
		const woffUrl = match[1];
		const famMatch = css.slice(0, match.index).match(/font-family:\s*'([^']+)'/);
		const weightMatch = css.slice(0, match.index).match(/font-weight:\s*(\d+)/);
		const styleMatch = css.slice(0, match.index).match(/font-style:\s*(\w+)/);
		const family = famMatch?.[1] ?? "font";
		const weight = weightMatch?.[1] ?? "400";
		const style = styleMatch?.[1] ?? "normal";
		const slug = nextSlug(family, weight, style);
		const filename = `${slug}.woff2`;

		const woffResp = await fetch(woffUrl);
		if (!woffResp.ok) throw new Error(`fetch woff2 ${theme} ${slug}: ${woffResp.status}`);
		const buf = Buffer.from(await woffResp.arrayBuffer());
		await writeFile(join(OUT_DIR, filename), buf);

		css = css.replace(woffUrl, `/static/fonts/${filename}`);
	}
	return css;
}

await mkdir(OUT_DIR, { recursive: true });
for (const [theme, url] of Object.entries(THEME_FONTS)) {
	const css = await buildTheme(theme, url);
	await writeFile(join(OUT_DIR, `${theme}.css`), css, "utf8");
	console.log(`wrote fonts/${theme}.css`);
}
console.log("done");
```

- [ ] **Step 2: Run the script**

Run: `bun scripts/fetch-fonts.ts`
Expected: prints `wrote fonts/aurora.css` … `wrote fonts/gourmet-noir.css` then `done`. Confirm `src/ui/static/fonts/` now contains 6 `.css` files plus their referenced `.woff2` files.

- [ ] **Step 3: Point theme.ts at the local font CSS**

In `src/ui/theme.ts`, replace every value in the `FONT_URL` map. The `neutral` entry stays `""`; the 6 themed entries each become `/static/fonts/<theme>.css`:

```ts
const FONT_URL: Record<Theme, string> = {
	neutral: "",
	aurora: "/static/fonts/aurora.css",
	"aurora-solstice": "/static/fonts/aurora-solstice.css",
	inkwell: "/static/fonts/inkwell.css",
	hearth: "/static/fonts/hearth.css",
	"hearth-spice": "/static/fonts/hearth-spice.css",
	"gourmet-noir": "/static/fonts/gourmet-noir.css",
};
```

- [ ] **Step 4: Fix the Task 3 font-link test**

The `base layout theme wiring → renders the active theme's font <link>` test (Task 3) asserted a Google Fonts URL. Update its assertion to the local path:

```ts
		it("renders the active theme's font <link>", async () => {
			const { app, cookie } = await setupApp();
			const res = await app.request("/settings", auth(cookie, { Cookie: `theme=hearth; mode=dark; session=${cookie}` }));
			const body = await res.text();
			expect(body).toContain('rel="stylesheet" href="/static/fonts/hearth.css"');
		});
```

- [ ] **Step 5: Update the service worker**

In `src/ui/static/sw.js`:

1. Bump the cache and add font CSS to the precache shell (lines 1-7):
```js
const CACHE = "recipe-manager-v4";
const SHELL = [
  "/static/app.css",
  "/static/htmx.min.js",
  "/manifest.webmanifest",
  "/login",
  "/static/fonts/aurora.css",
  "/static/fonts/aurora-solstice.css",
  "/static/fonts/inkwell.css",
  "/static/fonts/hearth.css",
  "/static/fonts/hearth-spice.css",
  "/static/fonts/gourmet-noir.css",
];
```
(The `.woff2` files are cached on first fetch by the existing `/static/*` runtime-cache handler.)

2. Fix the offline page's root element (line 10):
```js
<html lang="en" data-theme="neutral" data-mode="dark">
```

- [ ] **Step 6: Update static-asset test expectations**

If `tests/http/static.test.ts` asserts the SW shell or a list of static assets, add the 6 font CSS paths to its expected list. (Skim the file first; if it only checks `sw.js` is served, no change needed.)

- [ ] **Step 7: Run the full test suite**

Run: `bun test`
Expected: PASS (font-link test now green; SW/cache tests green).

- [ ] **Step 8: Commit**

```bash
git add scripts/fetch-fonts.ts src/ui/static/fonts src/ui/theme.ts src/ui/static/sw.js tests/http/theme-and-autocomplete.test.ts tests/http/static.test.ts
git commit -m "feat(ui): self-host theme fonts and precache in service worker"
```

---

## Task 10: Full verification + visual QA + Phase 1 closeout

**Files:** none (verification + manual QA)

- [ ] **Step 1: Typecheck, lint, full test suite**

Run: `bun run typecheck && bun run lint && bun test`
Expected: all green. (Suite is ~223+ tests plus the new ones.)

- [ ] **Step 2: Rebuild CSS**

Run: `bun run build:css`
Expected: writes `app.css`, no error.

- [ ] **Step 3: Visual QA checklist (dark mode, each of the 7 themes)**

Boot the dev server. For each theme in `{neutral, aurora, aurora-solstice, inkwell, hearth, hearth-spice, gourmet-noir}` (set via Settings → Appearance → Dark), load each screen and confirm:

- **/recipes** (library): cards render, no transparent/unset colors, fonts load, motifs show (aurora glow on focus, inkwell grayscale + mono section label "TAGS", hearth squiggle + leaf bullets n/a here, spice tile band on cards + diamond chips, gourmet small-caps h3).
- **/recipes/<id>** (cook view): description/notes/ingredients styled; hearth squiggle under "Ingredients"/"Steps" + leaf bullets; gourmet drop cap on description + ornament after headings + pull-quote notes; inkwell desaturated image.
- **/recipes/<id>/edit**: inputs use the theme font + radius; focus ring matches theme (aurora/spice glow, inkwell 2px text ring).
- **/settings**: gallery shows all 7 swatches, active ring on current theme, Light button disabled for the 6 themed themes.
- **/login**: auth card uses theme surface + radius.

Confirm: no console errors, no missing-token black holes, text contrast acceptable on every screen.

- [ ] **Step 4: Offline smoke test**

In browser DevTools → Application → Service Workers → "Offline", reload `/recipes` in a non-neutral theme. Confirm the page renders (app shell + font CSS precached; woff2 may runtime-cache after first load — visit each theme once online first).

- [ ] **Step 5: Commit any QA fixes**

```bash
git add -A
git commit -m "test(ui): phase 1 closeout — visual QA fixes"
```

(If no fixes, skip the commit.)

- [ ] **Step 6: Mark Phase 1 done**

Phase 1 is complete. Phase 2 (light variants for the 6 themed themes) gets its own plan after the mockup checkpoint described in the spec.

---

## Phase 2 outline (separate plan, later)

1. Mock up light variants for `aurora` and `hearth`; validate look with the user.
2. For each themed theme, add the light values (the `light-dark()` first argument is already in place from Task 6 — verify/refine against the approved light mockups).
3. Move each theme into `LIGHT_READY` in `src/ui/theme.ts` as its light variant ships; the Settings Light button auto-enables per theme.
4. Add light-mode assertions to the visual QA checklist.

---

## Self-review (completed)

**Spec coverage:** Goals → Tasks 1-3 (switchable, distinct, component HTML unchanged), 5-7 (full character), 9 (PWA offline), 1 (legacy normalization). Non-goals honored (no layout-restructure themes, no DB roaming, post-and-reload). Architecture §3 → Tasks 3, 5, 6 (two-axis + light-dark). Tokens §4 → Task 4 test enforces the full set. Theme catalog §5 → Task 6 (all 7 token blocks incl. fonts/radii) + Task 7 (motifs). Font loading §6 → Task 9. Persistence §7 → Task 1 (normalize + LIGHT_READY) + Task 2 (cookies). Routes §8 → Task 2. UI §9 → Tasks 3, 8. Phasing §10 → Phase 1 here, Phase 2 outlined. Tests §11 → Tasks 1, 2, 3, 4, 8, 9 + Task 10 visual QA.

**Placeholder scan:** none — every code step contains real code; the one "if static.test.ts asserts…" in Task 9 Step 6 is an explicit conditional instruction to read the file first, not a placeholder.

**Type consistency:** `Theme`/`Mode` from Task 1 are reused in Tasks 2, 4, 8, 9. `THEMES`/`LIGHT_READY` referenced consistently. `themeVars` return keys (`theme`, `mode`, `theme_color`, `theme_font`) match what `base.html` (Task 3) and `settings.html` (Task 8) consume. `FONT_URL` keys are renamed from CDN URLs to local paths in Task 9 (same map, same keys — consistent).
