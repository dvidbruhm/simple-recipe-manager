import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";
import { RecipeRepository } from "./repository";
import { searchRecipes } from "./search";

export function recipeRoutes(db: Database): Hono {
	const app = new Hono();
	const recipes = new RecipeRepository(db);
	const tags = new TagRepository(db);

	app.get("/recipes", (c) => {
		const q = c.req.query("q") ?? "";
		const tag = c.req.query("tag") ?? "";
		const list = q || tag ? searchRecipes(db, { q, tag }) : recipes.list();
		const tagList = tags.listAllWithCounts();
		if (c.req.header("HX-Request") === "true") {
			return c.html(render("partials/grid.html", { recipes: list }));
		}
		return c.html(
			render("library.html", {
				recipes: list,
				tags: tagList,
				q,
				active_tag: tag,
				title: "recipes",
			}),
		);
	});

	return app;
}
