import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import { toFractions } from "./fractions";
import { tagColor } from "./tag-color";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "templates");

const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATE_DIR), {
	autoescape: true,
	throwOnUndefined: true,
});

env.addGlobal("domain", (url: string) => {
	if (!url) return "";
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
});

env.addGlobal("tagColor", (name: string) => tagColor(name));

env.addFilter("fractions", (text: string) => toFractions(text));

env.addGlobal("stars", (rating: number) => {
	const full = "★".repeat(Math.max(0, Math.min(5, rating)));
	const empty = "☆".repeat(5 - full.length);
	return full + empty;
});

export function render(name: string, ctx: Record<string, unknown>): string {
	return env.render(name, ctx);
}

export function renderString(tpl: string, ctx: Record<string, unknown>): string {
	return env.renderString(tpl, ctx);
}
