import type { Context } from "hono";
import { getCookie } from "hono/cookie";

const NEXT = { light: "dark", dark: "light" } as const;
const ICON = { light: "🌙", dark: "☀" } as const;

export type Theme = keyof typeof NEXT;

export interface ThemeVars {
	theme: Theme;
	next_theme: Theme;
	theme_icon: string;
}

function normalize(value: string | undefined): Theme {
	if (value === "light" || value === "dark") return value;
	return "dark";
}

export function themeVars(c: Context): ThemeVars {
	const theme = normalize(getCookie(c, "theme"));
	return { theme, next_theme: NEXT[theme], theme_icon: ICON[theme] };
}
