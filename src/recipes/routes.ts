import type { Database } from "bun:sqlite";
import { getCookie } from "hono/cookie";
import { Hono, type Context } from "hono";
import type { Config } from "@/config";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";
import { removeImage, saveUploadedImage } from "./image-upload";
import { RecipeRepository } from "./repository";
import { searchRecipes, sortRecipes } from "./search";

export function recipeRoutes(db: Database, config: Config): Hono {
	const app = new Hono();
	const recipes = new RecipeRepository(db);
	const tags = new TagRepository(db);

	function libraryList(c: Context) {
		const q = c.req.query("q") ?? "";
		const selTags = (c.req.queries("tag") ?? []).filter(Boolean);
		const favOnly = selTags.includes("favorites");
		const normalTags = selTags.filter((t) => t !== "favorites");
		const sort = c.req.query("sort") ?? "";
		const view = getCookie(c, "view") === "list" ? "list" : "cards";
		const filtering = !!(q || normalTags.length || favOnly);
		let list = filtering
			? searchRecipes(db, { q, tags: normalTags, favorite: favOnly })
			: recipes.list();
		if (sort) list = sortRecipes(list, sort);
		const tagMap = tags.listForRecipes(list.map((r) => r.id));
		const recipesWithTags = list.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
		return {
			q,
			selTags,
			sort,
			view,
			filtering,
			recipesWithTags,
			hasAny: recipes.list().length > 0,
		};
	}

	function libraryGridHtml(data: ReturnType<typeof libraryList>): string {
		return render("partials/grid.html", {
			recipes: data.recipesWithTags,
			view: data.view,
			has_any: data.hasAny,
			is_filtered: data.filtering,
		});
	}

	app.get("/recipes", (c) => {
		const data = libraryList(c);
		if (c.req.header("HX-Request") === "true") {
			return c.html(libraryGridHtml(data));
		}
		const favCount = (
			db
				.query("SELECT COUNT(*) AS c FROM recipes WHERE favorite = 1 AND deleted_at IS NULL")
				.get() as { c: number }
		).c;
		const tagList = tags.listAllWithCounts();
		tagList.unshift({ name: "favorites", cnt: favCount });
		const toast = c.req.query("toast") ?? "";
		const undoUrl = c.req.query("undo_url") ?? "";
		return c.html(
			render("library.html", {
				recipes: data.recipesWithTags,
				tags: tagList,
				q: data.q,
				active_tags: data.selTags,
				active_sort: data.sort || "date-new",
				view: data.view,
				has_any: data.hasAny,
				is_filtered: data.filtering,
				toast,
				undo_url: undoUrl,
				undo_ids: [],
				title: "recipes",
				...themeVars(c),
			}),
		);
	});

	app.get("/recipes/new", (c) => {
		const importMode = c.req.query("import") ?? "";
		const url = c.req.query("url") ?? "";
		const blank = {
			id: 0,
			title: "",
			description: "",
			ingredients: [],
			steps: [],
			notes: "",
			source_url: url,
			image_filename: null,
			rating: 0,
			favorite: false,
			created_at: "",
			updated_at: "",
			deleted_at: null,
		};
		return c.html(
			render("recipe-edit.html", {
				r: blank,
				tags: [],
				ingredients_text: "",
				steps_text: "",
				mode: importMode,
				new_recipe: true,
				title: "New recipe",
				...themeVars(c),
			}),
		);
	});

	app.post("/recipes", async (c) => {
		const form = await c.req.formData();
		const title = String(form.get("title") ?? "");
		if (!title.trim()) return c.body("title required", 400);
		const ingredientsRaw = String(form.get("ingredients") ?? "");
		const stepsRaw = String(form.get("steps") ?? "");
		const tagsList = form
			.getAll("tags")
			.map((s) => String(s).trim())
			.filter(Boolean);
		const id = recipes.insert({
			title,
			description: String(form.get("description") ?? ""),
			ingredients: ingredientsRaw.split("\n").map((s) => s.trim()).filter(Boolean),
			steps: stepsRaw.split("\n").map((s) => s.trim()).filter(Boolean),
			notes: String(form.get("notes") ?? ""),
			source_url: String(form.get("source_url") ?? ""),
			rating: Number(form.get("rating") ?? 0) || 0,
		});
		tags.replaceForRecipe(id, tagsList);
		const file = form.get("image");
		if (file instanceof File && file.size > 0) {
			const filename = await saveUploadedImage(config.dataDir, file);
			if (filename) recipes.update(id, { image_filename: filename });
		}
		return c.redirect(`/recipes/${id}`);
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

	app.post("/recipes/:id/rating", async (c) => {
		const id = Number(c.req.param("id"));
		const existing = recipes.getById(id);
		if (!existing) return c.notFound();
		const body = await c.req.parseBody();
		const rating = Number(body.rating ?? 0);
		if (!Number.isInteger(rating) || rating < 0 || rating > 5) return c.body("invalid rating", 400);
		recipes.update(id, { rating });
		const updated = recipes.getById(id);
		return c.html(render("partials/rating.html", { r: updated }));
	});

	app.post("/recipes/:id/favorite", (c) => {
		const id = Number(c.req.param("id"));
		const existing = recipes.getById(id);
		if (!existing) return c.notFound();
		recipes.update(id, { favorite: !existing.favorite });
		const updated = recipes.getById(id);
		const favCount = (
			db
				.query("SELECT COUNT(*) AS c FROM recipes WHERE favorite = 1 AND deleted_at IS NULL")
				.get() as { c: number }
		).c;
		const btn = render("partials/favorite-btn.html", { r: updated });
		const oob = `<span id="fav-count" class="count opacity-70" hx-swap-oob="true">${favCount}</span>`;
		return c.html(btn + oob);
	});

	return app;
}
