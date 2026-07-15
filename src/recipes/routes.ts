import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import type { Config } from "@/config";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";
import { removeImage, saveUploadedImage } from "./image-upload";
import { RecipeRepository } from "./repository";
import { searchRecipes } from "./search";

export function recipeRoutes(db: Database, config: Config): Hono {
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
		const toast = c.req.query("toast") ?? "";
		const undoUrl = c.req.query("undo_url") ?? "";
		return c.html(
			render("library.html", {
				recipes: list,
				tags: tagList,
				q,
				active_tag: tag,
				toast,
				undo_url: undoUrl,
				title: "recipes",
				...themeVars(c),
			}),
		);
	});

	app.get("/recipes/:id", (c) => {
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe || recipe.deleted_at) return c.notFound();
		const tagRows = tags.listForRecipe(id);
		return c.html(
			render("recipe-view.html", {
				r: recipe,
				tags: tagRows.map((t) => t.name),
				title: recipe.title,
				...themeVars(c),
			}),
		);
	});

	app.get("/recipes/:id/edit", (c) => {
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe) return c.notFound();
		const tagRows = tags.listForRecipe(id);
		const mode = c.req.query("mode") ?? "";
		return c.html(
			render("recipe-edit.html", {
				r: recipe,
				tags: tagRows.map((t) => t.name),
				ingredients_text: recipe.ingredients.join("\n"),
				steps_text: recipe.steps.join("\n"),
				mode,
				title: `Edit ${recipe.title}`,
				...themeVars(c),
			}),
		);
	});

	app.post("/recipes/:id", async (c) => {
		const id = Number(c.req.param("id"));
		const existing = recipes.getById(id);
		if (!existing) return c.notFound();
		const form = await c.req.formData();
		const title = String(form.get("title") ?? "");
		if (!title.trim()) return c.body("title required", 400);
		const ingredientsRaw = String(form.get("ingredients") ?? "");
		const stepsRaw = String(form.get("steps") ?? "");
		const tagsList = form
			.getAll("tags")
			.map((s) => String(s).trim())
			.filter(Boolean);

		recipes.update(id, {
			title,
			description: String(form.get("description") ?? ""),
			ingredients: ingredientsRaw
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean),
			steps: stepsRaw
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean),
			notes: String(form.get("notes") ?? ""),
			source_url: String(form.get("source_url") ?? ""),
			rating: Number(form.get("rating") ?? 0) || 0,
		});
		tags.replaceForRecipe(id, tagsList);

		const file = form.get("image");
		if (file instanceof File && file.size > 0) {
			const filename = await saveUploadedImage(config.dataDir, file);
			if (filename) {
				if (existing.image_filename) {
					await removeImage(config.dataDir, existing.image_filename);
				}
				recipes.update(id, { image_filename: filename });
			}
		}

		return c.redirect(`/recipes/${id}`);
	});

	app.post("/recipes/:id/delete", (c) => {
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe) return c.notFound();
		recipes.softDelete(id);
		const toast = `Deleted "${recipe.title ?? ""}"`;
		const undo = `/recipes/${id}/restore`;
		return c.redirect(
			`/recipes?toast=${encodeURIComponent(toast)}&undo_url=${encodeURIComponent(undo)}`,
		);
	});

	app.post("/recipes/:id/restore", (c) => {
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe) return c.notFound();
		recipes.restore(id);
		return c.redirect(`/recipes/${id}`);
	});

	return app;
}
