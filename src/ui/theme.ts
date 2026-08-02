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
	aurora: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
	"aurora-solstice":
		"https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
	inkwell:
		"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
	hearth:
		"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"hearth-spice":
		"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"gourmet-noir":
		"https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&display=swap",
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
