import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, type Theme } from "@/ui/theme";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = join(__dirname, "..", "..", "..", "src", "ui", "css", "app.tailwind.css");

const REQUIRED_TOKENS = [
	"--color-bg",
	"--color-surface",
	"--color-elevated",
	"--color-text",
	"--color-muted",
	"--color-accent",
	"--color-accent-soft",
	"--color-border",
	"--color-danger",
	"--color-favorite",
	"--color-star",
	"--font-display",
	"--font-body",
	"--radius-card",
	"--radius-control",
	"--radius-pill",
	"--shadow-card",
	"--shadow-hover",
	"--ring",
] as const;

const COLOR_TOKENS = [
	"--color-bg",
	"--color-surface",
	"--color-elevated",
	"--color-text",
	"--color-muted",
	"--color-accent",
	"--color-accent-soft",
	"--color-border",
	"--color-danger",
	"--color-favorite",
	"--color-star",
] as const;

function blockFor(css: string, theme: Theme): string {
	const start = css.indexOf(`[data-theme="${theme}"]`);
	if (start === -1) return "";
	let depth = 0;
	let i = css.indexOf("{", start);
	const from = i;
	for (; i < css.length; i++) {
		if (css[i] === "{") depth++;
		else if (css[i] === "}") {
			depth--;
			if (depth === 0) break;
		}
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
