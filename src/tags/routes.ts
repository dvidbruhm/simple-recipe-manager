import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { TagRepository } from "./repository";

const ESC: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch);
}

export function tagRoutes(db: Database): Hono {
	const app = new Hono();
	const tags = new TagRepository(db);

	app.get("/tags/autocomplete", (c) => {
		const q = c.req.query("q") ?? "";
		if (q.length < 1) return c.body("", 200);
		const names = tags.autocomplete(q);
		const html = names
			.map((n) => `<li class="chip" data-name="${escapeHtml(n)}">${escapeHtml(n)}</li>`)
			.join("");
		return c.html(html);
	});

	return app;
}
