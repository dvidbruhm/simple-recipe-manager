import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { TagRepository } from "./repository";

export function tagRoutes(db: Database): Hono {
	const app = new Hono();
	const tags = new TagRepository(db);

	app.get("/tags/autocomplete", (c) => {
		const q = c.req.query("q") ?? "";
		if (q.length < 1) return c.json([]);
		const names = tags.autocomplete(q);
		return c.json(names);
	});

	return app;
}
