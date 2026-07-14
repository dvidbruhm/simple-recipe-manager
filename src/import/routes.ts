import { type Context, Hono } from "hono";
import type { Config } from "@/config";
import type { Recipe, RecipeRepository } from "@/recipes/repository";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";
import { extractRecipe, type PartialRecipe } from "./extractor";
import { fetchHtml } from "./fetcher";
import { downloadImage } from "./image";

export function importRoutes(config: Config, recipes: RecipeRepository): Hono {
	const app = new Hono();

	app.get("/import", (c) => {
		return c.html(render("import.html", { title: "Import a recipe", ...themeVars(c) }));
	});

	async function downloadImageIfNeeded(recipeId: number, image: string) {
		const filename = await downloadImage(config.dataDir, image);
		if (filename) recipes.update(recipeId, { image_filename: filename });
	}

	async function runImport(c: Context, url: string): Promise<Response> {
		if (!url) return c.redirect("/import");

		const fetched = await fetchHtml(url);
		if (!fetched) {
			const id = recipes.insert({ source_url: url });
			return c.redirect(`/recipes/${id}/edit?mode=paste_html`);
		}

		const outcome = await extractRecipe(url, fetched.html);
		if (outcome.kind === "structured" || outcome.kind === "readability") {
			const id = recipes.insert(toInput(outcome.recipe, url));
			if (outcome.recipe.image) {
				await downloadImageIfNeeded(id, outcome.recipe.image);
			}
			return c.redirect(`/recipes/${id}/edit`);
		}

		const id = recipes.insert({ source_url: url });
		return c.redirect(`/recipes/${id}/edit?mode=manual`);
	}

	app.post("/recipes/import", async (c) => {
		const body = await c.req.parseBody();
		const url = String(body.url ?? "");
		return runImport(c, url);
	});

	app.get("/import/shared", async (c) => {
		const url = c.req.query("url") ?? "";
		if (!url) return c.html("No URL was shared", 400);
		return runImport(c, url);
	});

	app.post("/recipes/import/html", async (c) => {
		const body = await c.req.parseBody();
		const recipeId = Number(body.recipe_id);
		if (!Number.isFinite(recipeId) || recipeId <= 0) {
			return c.body("Missing or invalid recipe_id", 400);
		}
		const existing: Recipe | null = recipes.getById(recipeId);
		if (!existing) return c.body("Recipe not found", 404);
		const html = String(body.html ?? "");
		if (!html) {
			return c.redirect(`/recipes/${recipeId}/edit?mode=paste_html&error=empty_html`);
		}

		const url = existing.source_url || String(body.url ?? "");
		const outcome = await extractRecipe(url, html);

		if (outcome.kind === "structured" || outcome.kind === "readability") {
			recipes.update(recipeId, toInput(outcome.recipe, url));
			if (outcome.recipe.image) {
				await downloadImageIfNeeded(recipeId, outcome.recipe.image);
			}
			return c.redirect(`/recipes/${recipeId}/edit`);
		}
		return c.redirect(`/recipes/${recipeId}/edit?mode=paste_html&error=extract_failed`);
	});

	return app;
}

function toInput(recipe: PartialRecipe, url: string) {
	const { image: _image, ...fields } = recipe;
	return { ...fields, source_url: url };
}
