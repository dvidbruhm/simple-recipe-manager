import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";

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
