import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import type { App, Ctx } from "@/app";
import { TagRepository } from "./repository";

export function tagRoutes(db: Database): App {
	const app: App = new Hono();

	function userIdFrom(c: Ctx): number {
		const id = c.get("userId");
		if (typeof id !== "number" || !Number.isFinite(id)) {
			throw new Error("userId missing from context");
		}
		return id;
	}

	app.get("/tags/autocomplete", (c) => {
		const q = c.req.query("q") ?? "";
		if (q.length < 1) return c.json([]);
		const tags = new TagRepository(db, userIdFrom(c));
		const names = tags.autocomplete(q);
		return c.json(names);
	});

	return app;
}
