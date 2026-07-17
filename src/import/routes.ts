import { type Context, Hono } from "hono";
import type { Config } from "@/config";
import type { RecipeRepository } from "@/recipes/repository";
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

		const fetched = await fetchHtml(url, config.fetchProxy);
		if (!fetched) {
			return c.redirect(`/recipes/new?import=paste_html&url=${encodeURIComponent(url)}`);
		}

		const outcome = await extractRecipe(url, fetched.html);
		if (outcome.kind === "structured" || outcome.kind === "readability") {
			const id = recipes.insert(toInput(outcome.recipe, url));
			if (outcome.recipe.image) {
				await downloadImageIfNeeded(id, outcome.recipe.image);
			}
			return c.redirect(`/recipes/${id}/edit`);
		}

		return c.redirect(`/recipes/new?import=manual&url=${encodeURIComponent(url)}`);
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
		const html = String(body.html ?? "");
		const recipeId = Number(body.recipe_id);
		const existing =
			Number.isFinite(recipeId) && recipeId > 0 ? recipes.getById(recipeId) : null;
		const hasExisting = existing != null;
		const url = existing?.source_url || String(body.url ?? "");
		const backToPaste = `/recipes/new?import=paste_html&url=${encodeURIComponent(url)}`;
		if (!html) {
			return c.redirect(`${backToPaste}&error=empty_html`);
		}

		const outcome = await extractRecipe(url, html);

		if (outcome.kind === "structured" || outcome.kind === "readability") {
			if (hasExisting) {
				recipes.update(recipeId, toInput(outcome.recipe, url));
				if (outcome.recipe.image) {
					await downloadImageIfNeeded(recipeId, outcome.recipe.image);
				}
				return c.redirect(`/recipes/${recipeId}/edit`);
			}
			const id = recipes.insert(toInput(outcome.recipe, url));
			if (outcome.recipe.image) {
				await downloadImageIfNeeded(id, outcome.recipe.image);
			}
			return c.redirect(`/recipes/${id}/edit`);
		}
		if (hasExisting) {
			return c.redirect(`/recipes/${recipeId}/edit?mode=paste_html&error=extract_failed`);
		}
		return c.redirect(`${backToPaste}&error=extract_failed`);
	});

	return app;
}

function toInput(recipe: PartialRecipe, url: string) {
	const { image: _image, ...fields } = recipe;
	return { ...fields, source_url: url };
}
