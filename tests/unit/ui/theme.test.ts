import type { Context } from "hono";
import { themeVars, THEMES, LIGHT_READY, type Theme, type Mode } from "@/ui/theme";

function ctx(cookies: Record<string, string>): Context {
	// hono's getCookie reads c.req.raw.headers.get("Cookie"); provide that shape.
	const headers = new Headers();
	for (const [k, v] of Object.entries(cookies)) headers.append("Cookie", `${k}=${v}`);
	return { req: { raw: { headers } } } as unknown as Context;
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
