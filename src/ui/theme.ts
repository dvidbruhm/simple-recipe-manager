import type { Context } from "hono";
import { getCookie } from "hono/cookie";

export const THEMES = [
	"neutral",
	"aurora",
	"aurora-solstice",
	"inkwell",
	"hearth",
	"hearth-spice",
	"gourmet-noir",
] as const;
export type Theme = (typeof THEMES)[number];

export type Mode = "light" | "dark";

/** Themes whose light variant is shipped. Others fall back to neutral+light. Grows in Phase 2. */
export const LIGHT_READY: Set<Theme> = new Set<Theme>(["neutral"]);

const DEFAULT_THEME: Theme = "neutral";
const DEFAULT_MODE: Mode = "dark";

/** <meta name="theme-color"> per theme × mode (PWA chrome). */
const THEME_COLOR: Record<Theme, Record<Mode, string>> = {
	neutral: { light: "#f1f1ef", dark: "#161617" },
	aurora: { light: "#f4f6fb", dark: "#0b0e14" },
	"aurora-solstice": { light: "#faf6f0", dark: "#100c08" },
	inkwell: { light: "#ffffff", dark: "#000000" },
	hearth: { light: "#f7f2ea", dark: "#1f1a16" },
	"hearth-spice": { light: "#faf3ea", dark: "#1f1410" },
	"gourmet-noir": { light: "#f9f4ea", dark: "#15120e" },
};

/** Google Fonts CSS2 URL per theme (a later task swaps these for self-hosted /static/fonts/<theme>.css). */
const FONT_URL: Record<Theme, string> = {
	neutral: "",
	aurora: "/static/fonts/aurora.css",
	"aurora-solstice": "/static/fonts/aurora-solstice.css",
	inkwell: "/static/fonts/inkwell.css",
	hearth: "/static/fonts/hearth.css",
	"hearth-spice": "/static/fonts/hearth-spice.css",
	"gourmet-noir": "/static/fonts/gourmet-noir.css",
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
