# Multi-theme system with on-the-fly switching

**Date:** 2026-08-02
**Status:** Approved
**Scope:** Replace the single light/dark toggle with a selectable theme system. Ship 7 themes (the existing neutral plus 6 new: aurora, aurora-solstice, inkwell, hearth, hearth-spice, gourmet-noir), each available in light AND dark, switchable from the Settings page. Themes carry full character — color, typography, radii, and signature decorative motifs (Level C fidelity).

## 1. Goals

- User can pick from 7 themes on the Settings page and switch on the fly.
- Each theme exists in both a light and a dark variant.
- Themes are genuinely distinct: each brings its own font pairing, radius system, accent palette, and signature motifs (not just a color swap).
- Component HTML is unchanged across themes — themes are expressed purely through CSS (tokens + scoped decoration).
- The PWA keeps working offline (fonts self-hosted and precached; system-font fallback).
- Existing users upgrade cleanly (legacy `theme=light|dark` cookie normalizes to neutral + that mode).

## 2. Non-goals

- **Layout-restructuring themes.** The Mise variants (IDE/Dashboard/Console), Phosphor, Frost, Tape Deck, Riso Zine, and Grid change component *structure*, not just styling. They are out of scope for this token/motif system. The 6 chosen themes are all visual-restyle themes.
- A live no-reload preview engine. Switching posts and reloads (the existing `/theme` pattern). Optional JS live-preview is an enhancement, not required.
- Per-user (DB-backed) theme roaming. Preference stays a per-device cookie (matches the existing `view` cookie). Noted as future work.
- Custom/user-authored themes and a theme editor.
- Auto-switching via `prefers-color-scheme`. Mode is an explicit user choice.

## 3. Architecture overview

The app becomes a **two-axis** system on the root element:

```html
<html data-theme="hearth" data-mode="dark">
```

- `data-theme` — the visual theme id (`neutral`, `aurora`, `aurora-solstice`, `inkwell`, `hearth`, `hearth-spice`, `gourmet-noir`).
- `data-mode` — `light` | `dark`.

**Separation of concerns:**

- Fonts, radii, shadows, and motif rules are defined **once per theme** and are mode-agnostic.
- Only color tokens vary by mode, expressed inline with the CSS **`light-dark()`** function, resolved via `color-scheme` set from `data-mode`:

```css
[data-mode="light"] { color-scheme: light; }
[data-mode="dark"]  { color-scheme: dark; }

[data-theme="hearth"] {
  --color-bg:   light-dark(#f7f2ea, #1f1a16);   /* light, dark */
  --color-text: light-dark(#2c241c, #e8dcc8);
  --font-display: "Fraunces", Georgia, serif;
  --radius-card: 28px;
  /* ...one declaration per token, both modes inline... */
}
```

This is **Approach C** (chosen over explicit `[data-theme][data-mode]` blocks for DRY-ness — one declaration per token holds both modes; no duplication). `light-dark()` is supported by all target browsers (Chromium ≥123, Firefox ≥120, Safari ≥17.5); Android WebView (PWA) is Chromium, so the browser floor for this self-hosted homelab app is met. **No fallback is implemented** for browsers without `light-dark()` support; if that ever becomes a concern, add explicit `@supports not (color: light-dark(red, red))` overrides.

**Motif principle:** components keep stable semantic class hooks and consume tokens; a theme's CSS both (a) supplies token values and (b) opts in extra decoration scoped to `[data-theme="X"]`. New components work everywhere automatically; a theme adds flourish on top.

## 4. Token expansion

The current 8 tokens (`--color-bg/surface/text/muted/accent/border/danger/favorite` + `--radius-card`) grow to:

| Group | Tokens |
|---|---|
| Color | `--color-bg`, `--color-surface`, `--color-elevated`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-soft`, `--color-border`, `--color-danger`, `--color-favorite`, `--color-star` |
| Type | `--font-display`, `--font-body` (optional `--font-accent`, `--font-mono`) |
| Radius | `--radius-card`, `--radius-control`, `--radius-pill` |
| Shadow | `--shadow-card`, `--shadow-hover` |
| Focus | `--ring` |

Every theme block MUST define all tokens in the required set (enforced by a token-coverage test — §11). `body { font-family: ... }` stops being hardcoded and becomes `var(--font-body)`. All color values use `light-dark()`.

## 5. Theme catalog

Dark palettes are taken from the approved mockups. Light palettes are derived (light tint background, dark text, same hue accents adjusted for contrast). Fonts and motifs are mode-agnostic.

| Theme | Display / Body fonts | Radius | Signature motifs |
|---|---|---|---|
| **neutral** (default) | system sans | 4px | none (baseline) |
| **aurora** | Inter / Inter | 10–12px | glassy 1px borders + inset top highlight; accent **glow ring** on focus (`0 0 0 1px accent/.4, 0 0 20px accent/.25`); faint aurora-glow blob behind header |
| **aurora-solstice** | Sora / Inter | 10–12px | same glassy surfaces + warm **amber glow ring**; warm aurora-glow blob |
| **inkwell** | Inter / Inter + IBM Plex Mono (meta) | 2px | **zero chroma** (grayscale only — danger is monochrome); hairline 1px borders/dividers; tiny uppercase letter-spaced mono section labels (`§ 0N`); images desaturated ~15% in dark; no shadows/gradients |
| **hearth** | Fraunces / Nunito | 24–32px (organic), pill buttons | hand-drawn **squiggle dividers** under section headings (inline SVG); leaf/sprig bullets in ingredient lists; warm soft shadows; subtle grain; pill tag chips |
| **hearth-spice** | Fraunces / Nunito | 20–28px | **tile-pattern border bands** on cards/panels/dropdowns (CSS repeating-gradient diamond motif); rotated-diamond stamp accents on chips/labels; ornamental dividers |
| **gourmet-noir** | Playfair Display / Inter | 0–2px | **drop caps** on description & notes (`::first-letter`); italic kicker lines above section labels; hairline ruled dividers with centered ornaments (❦ / ✦); small-caps eyebrows; pull-quote styling for notes |

### Palette reference (key tokens)

```
neutral   dark:  bg #161617 surface #2d2d33 text #e8e8e6 accent #94b386 border #3a3a40
neutral   light: bg #f1f1ef surface #ffffff text #1a1a1a accent #5a7a4f border #d8d8d4

aurora    dark:  bg #0b0e14 surface #131720 text #e6e8ec accent #6366f1 danger #f87171
aurora    light: bg #f4f6fb surface #ffffff text #0f1320 accent #4f46e5 danger #dc2626

solstice  dark:  bg #100c08 surface #1a1410 text #f0e8de accent #f97316 danger #ef4444
solstice  light: bg #faf6f0 surface #ffffff text #2a2018 accent #ea580c danger #dc2626

inkwell   dark:  bg #000000 surface #0a0a0a text #ffffff muted #6a6a6a (no chroma)
inkwell   light: bg #ffffff surface #f5f5f5 text #000000 muted #6a6a6a (no chroma)

hearth    dark:  bg #1f1a16 surface #2a221c text #e8dcc8 accent #8aa67a (sage) + terracotta #c97a4a
hearth    light: bg #f7f2ea surface #fffaf2 text #2c241c accent #5f7a52 danger #b15a3a

spice     dark:  bg #1f1410 surface #2a1c16 text #f2e6d3 accent #d2603a (paprika) + turmeric #e0a82e + teal #2e8a8a
spice     light: bg #faf3ea surface #fff8ef text #2e1f15 accent #c24a25 teal #1f6f6f danger #b03a1a

gourmet   dark:  bg #15120e surface #1d1812 text #ece4d3 accent #d4b483 (gold) danger #c97a4a
gourmet   light: bg #f9f4ea surface #fffdf7 text #2a2014 accent #a07a2e danger #a8472b
```

## 6. Font loading (PWA offline)

Google Fonts CDN won't load offline; the service worker must precache. Strategy:

- **Self-host** all theme typefaces as woff2 under `src/ui/static/fonts/`, one CSS file per theme (`/static/fonts/aurora.css`, etc.) defining `@font-face` for that theme's families. Minimal weights only (e.g. 400/500/600/700 where used).
- `base.html` emits `<link rel="stylesheet" href="/static/fonts/{theme}.css">` for the **active theme only** (server picks from the cookie).
- System-font fallback in every `@font-face` stack so un-cached/offline still renders legibly.
- Service worker install precaches **all** theme font CSS + woff2 so any theme works offline after first load.

Fonts to self-host: Inter, Sora, Fraunces, Nunito, IBM Plex Mono, Playfair Display.

## 7. Persistence

Two cookies, per-device (matches the existing `view` cookie pattern; no DB migration):

- `theme` — one of the 7 ids.
- `mode` — `light` | `dark`.

**Legacy normalization** in `theme.ts` on read: an existing `theme=light` → `{ theme: "neutral", mode: "light" }`; `theme=dark` → `{ theme: "neutral", mode: "dark" }`; unknown/absent → default `{ theme: "neutral", mode: "dark" }`.

**Unsupported-combo fallback:** until Phase 2 lands, a themed theme requested in `light` mode normalizes to `{ theme: "neutral", mode: "light" }` (so render never breaks). A per-theme `LIGHT_READY: Set<Theme>` constant drives this and the gallery's disabled light option; themes are removed from it as their light variants ship.

`src/ui/theme.ts` is rewritten:

```ts
export const THEMES = ["neutral","aurora","aurora-solstice","inkwell","hearth","hearth-spice","gourmet-noir"] as const;
export type Theme = (typeof THEMES)[number];
export type Mode = "light" | "dark";

export interface ThemeVars { theme: Theme; mode: Mode; themeColor: string; }
export function themeVars(c: Context): ThemeVars { /* read + normalize cookies */ }
```

`themeColor` returns the per-theme+mode value for the PWA `<meta name="theme-color">`. The old `next_theme` / `theme_icon` fields are removed (header toggle is gone).

## 8. Routes

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/theme` | authenticated | Accepts `theme` + `mode`. Validates both against allowed lists (400 on invalid). Sets both cookies (1y, `SameSite=Lax`, `Path=/`). Redirects to `Referer` or `/recipes`. |

`/theme` validation list is the `THEMES` const + `light|dark` for mode. Existing `/view` route unchanged.

## 9. UI

### Settings — Appearance gallery (`settings.html`)

New "Appearance" card at the top of Settings: a responsive grid of **7 theme swatches**. Each swatch is a mini preview tile (a tiny mock card rendered with that theme's accent + font + radius, labelled with the theme name). Selecting a theme highlights it. A **light/dark segmented control** sets the mode. A single `<form>` posts `theme` + `mode` to `/theme`; the page reloads in the new theme (consistent with current behavior).

Optional progressive enhancement: a small inline script swaps `data-theme`/`data-mode` on `<html>` live as the user hovers/selects, for instant preview before submit. Not required for v1.

### Header (`base.html`)

- Remove the theme-toggle `<form action="/theme">` and its `☀/☾` button.
- Keep the settings gear.
- Root: `<html data-theme="{{ theme }}" data-mode="{{ mode }}">`.
- `<meta name="theme-color" content="{{ themeColor }}">`.

### CSS (`app.tailwind.css`)

- Keep the existing `@theme` neutral defaults as the `neutral` baseline.
- Replace the `[data-theme="dark"]` and `prefers-color-scheme` blocks with the new two-axis system: per-theme blocks using `light-dark()`, plus the `color-scheme` rules keyed on `data-mode`.
- Add per-theme motif rules scoped to `[data-theme="X"]`.
- Expand component rules to consume the new tokens (`--font-body`, `--radius-card/control/pill`, `--shadow-*`, `--ring`, `--color-accent-soft`).

## 10. Phasing

**Phase 1 — infrastructure + dark themes:**
Two-axis attributes + token expansion + `light-dark()` plumbing; self-host fonts + SW precache; Settings gallery with light/dark control; remove header toggle; rewrite `theme.ts` + `/theme` route; port `neutral` (both modes — already exists) and the **6 dark themes** from the approved mockups; update tests. End state: 7 themes selectable. In the gallery, the mode control only offers modes that are ready for the selected theme — `neutral` offers light+dark; the 6 themed themes are **dark-selectable only** in Phase 1 (their light option is disabled/hidden). `theme.ts` also **defensively normalizes** unsupported combos: a themed theme requested in light mode falls back to `neutral`+light at render, so a stale cookie or direct POST can never break the page.

**Phase 2 — light variants:**
Design + port light token sets for the 6 themed themes; the gallery's light option lights up for each as it lands. **Checkpoint:** mock up 1–2 light variants (likely `aurora` and `hearth`) and validate the look before committing all 6, since light variants were not part of the original mockups. End state: all 14 variants (7 × 2) fully themed and selectable.

## 11. Testing strategy

### Unit (`tests/unit/ui/theme.test.ts`)

- `themeVars` legacy normalization: `theme=light` → neutral+light; `theme=dark` → neutral+dark; new id passes through; absent → default neutral+dark; invalid → default.
- `mode` normalization: `light`/`dark` pass; invalid/absent → `dark`.
- `themeColor` returns a value for every theme × mode combination.
- `THEMES` const is exactly the 7 expected ids.

### CSS token coverage (new, `tests/unit/ui/css-coverage.test.ts`)

Parse the compiled `app.css` and assert that **every** `[data-theme="X"]` block defines **every** token in the required set (§4). Catches a theme missing `--color-star` or `--font-display`, etc. Also assert `light-dark(` is used for every color token and that both `color-scheme` rules exist.

### HTTP (`tests/http/theme-and-autocomplete.test.ts`, rewrite)

- `POST /theme` with valid `theme`+`mode` → 303/302, both cookies set.
- `POST /theme` with invalid theme → 400; invalid mode → 400.
- `GET /settings` body contains the Appearance gallery with all 7 theme swatches and the light/dark control.
- `base.html` render: root has `data-theme` + `data-mode`; **no** header theme-toggle form; `<meta name="theme-color">` present.
- Legacy cookie: a request with `Cookie: theme=light` renders `data-theme="neutral" data-mode="light"`.

### Visual QA checklist (manual, per Phase)

For each theme × mode, load library, recipe view, edit, settings, login and confirm: no missing tokens (no transparent/black holes), text contrast OK, motifs render, fonts load. Required because bun test has no browser.

### Existing tests

- Update any assertion that expects the header `action="/theme"` toggle or `data-theme="dark"` default.
- `tests/http/static.test.ts` — add the new `/static/fonts/*.css` and woff2 to the served-asset checks and SW precache expectations.

## 12. Out-of-scope / future work

- Per-user (DB-backed) theme + mode roaming across devices.
- More themes — including the layout-restructuring ones (Mise variants, Phosphor, Frost, Tape Deck, Riso Zine, Grid), which would require component-level work beyond tokens/motifs.
- `prefers-color-scheme` auto mode as a third option.
- Font subsetting per-language and weight optimization beyond basic self-hosting.
- A live no-reload preview engine and theme animations on switch.
