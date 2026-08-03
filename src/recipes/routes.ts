import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { App, Ctx } from "@/app";
import type { Config } from "@/config";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";
import { removeImage, saveUploadedImage } from "./image-upload";
import { RecipeRepository } from "./repository";
import { searchRecipes, sortRecipes } from "./search";

export function recipeRoutes(db: Database, config: Config): App {
	const app: App = new Hono();

	function userIdFrom(c: Ctx): number {
		const id = c.get("userId");
		if (typeof id !== "number" || !Number.isFinite(id)) {
			throw new Error("userId missing from context");
		}
		return id;
	}

	function repos(c: Ctx) {
		const userId = userIdFrom(c);
		return {
			userId,
			recipes: new RecipeRepository(db, userId),
			tags: new TagRepository(db, userId),
		};
	}

	const PAGE_SIZE = 60;
	const DEFAULT_SORT = "date-new";
	const SORT_LABELS: Record<string, string> = {
		"name-asc": "Name (A → Z)",
		"name-desc": "Name (Z → A)",
		"date-new": "Newest",
		"date-old": "Oldest",
		"rating-asc": "Stars (0 → 5)",
		"rating-desc": "Stars (5 → 0)",
	};

	function buildLibraryUrl(opts: { q?: string; tags?: string[]; sort?: string }): string {
		const params = new URLSearchParams();
		if (opts.q) params.set("q", opts.q);
		for (const t of opts.tags ?? []) params.append("tag", t);
		if (opts.sort && opts.sort !== DEFAULT_SORT) params.set("sort", opts.sort);
		const s = params.toString();
		return s ? `/recipes?${s}` : "/recipes";
	}

	function libraryList(
		c: Ctx,
		opts?: { q?: string; tags?: string[]; sort?: string; page?: number },
	) {
		const { recipes, tags, userId } = repos(c);
		const q = opts?.q ?? c.req.query("q") ?? "";
		const selTags = (opts?.tags ?? c.req.queries("tag") ?? []).filter(Boolean);
		const favOnly = selTags.includes("favorites");
		const normalTags = selTags.filter((t) => t !== "favorites");
		const sort = opts?.sort ?? c.req.query("sort") ?? "";
		const view = getCookie(c, "view") === "list" ? "list" : "cards";
		const filtering = !!(q || normalTags.length || favOnly);
		const rawPage = Number(c.req.query("page") ?? "1");
		const page = Math.max(1, opts?.page ?? (Number.isFinite(rawPage) ? rawPage : 1));
		let list = filtering
			? searchRecipes(db, { q, tags: normalTags, favorite: favOnly, ownerId: userId })
			: recipes.list();
		const effectiveSort = sort || DEFAULT_SORT;
		list = sortRecipes(list, effectiveSort);
		const total = list.length;
		const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
		const safePage = Math.min(page, totalPages);
		const start = (safePage - 1) * PAGE_SIZE;
		const paged = list.slice(start, start + PAGE_SIZE);
		const tagMap = tags.listForRecipes(paged.map((r) => r.id));
		const recipesWithTags = paged.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));

		const activeFilters: Array<{ label: string; removeUrl: string }> = [];
		if (q) {
			activeFilters.push({
				label: `Search: "${q}"`,
				removeUrl: buildLibraryUrl({ tags: selTags, sort: effectiveSort }),
			});
		}
		for (const t of selTags) {
			const remainingTags = selTags.filter((x) => x !== t);
			activeFilters.push({
				label: t === "favorites" ? "♥ Favorites" : t,
				removeUrl: buildLibraryUrl({ q, tags: remainingTags, sort: effectiveSort }),
			});
		}
		if (effectiveSort !== DEFAULT_SORT) {
			activeFilters.push({
				label: `Sort: ${SORT_LABELS[effectiveSort] ?? effectiveSort}`,
				removeUrl: buildLibraryUrl({ q, tags: selTags }),
			});
		}

		return {
			q,
			selTags,
			sort: effectiveSort,
			view,
			filtering,
			recipesWithTags,
			hasAny: recipes.list().length > 0,
			page: safePage,
			totalPages,
			hasMore: safePage < totalPages,
			total,
			activeFilters,
			clearUrl: "/recipes",
			sortLabel: SORT_LABELS[effectiveSort] ?? "Newest",
		};
	}

	function libraryGridHtml(
		data: ReturnType<typeof libraryList>,
		opts?: { append?: boolean },
	): string {
		return render("partials/grid.html", {
			recipes: data.recipesWithTags,
			view: data.view,
			has_any: data.hasAny,
			is_filtered: data.filtering,
			page: data.page,
			total_pages: data.totalPages,
			has_more: data.hasMore,
			total: data.total,
			active_filters: data.activeFilters,
			clear_url: data.clearUrl,
			sort_label: data.sortLabel,
			append: opts?.append === true,
			// This partial is only rendered for HTMX requests; library.html renders the
			// canonical #library-meta / #sort-label on full page loads. The OOB swap targets
			// below must emit only here, never inline in a full-page render.
			htmx: true,
		});
	}

	app.get("/recipes", (c) => {
		const data = libraryList(c);
		if (c.req.header("HX-Request") === "true") {
			const rawPage = Number(c.req.query("page") ?? "1") || 1;
			const append = rawPage > 1;
			return c.html(libraryGridHtml(data, { append }));
		}
		const { tags, recipes: recipeRepo } = repos(c);
		const favCount = recipeRepo.countFavorites();
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
				active_sort: data.sort,
				sort_label: data.sortLabel,
				view: data.view,
				has_any: data.hasAny,
				is_filtered: data.filtering,
				page: data.page,
				total_pages: data.totalPages,
				has_more: data.hasMore,
				total: data.total,
				active_filters: data.activeFilters,
				clear_url: data.clearUrl,
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
		const error = c.req.query("error") ?? "";
		const blank = {
			id: 0,
			title: "",
			description: "",
			ingredients: [],
			steps: [],
			notes: "",
			source_url: url,
			image_filename: null,
			base_servings: null,
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
				edit_mode: importMode,
				error,
				new_recipe: true,
				title: "New recipe",
				...themeVars(c),
			}),
		);
	});

	app.post("/recipes", async (c) => {
		const { recipes, tags } = repos(c);
		const form = await c.req.formData();
		const title = String(form.get("title") ?? "");
		if (!title.trim()) return c.body("title required", 400);
		const ingredientsRaw = String(form.get("ingredients") ?? "");
		const stepsRaw = String(form.get("steps") ?? "");
		const tagsList = form
			.getAll("tags")
			.map((s) => String(s).trim())
			.filter(Boolean);
		const baseServings = parseServings(form.get("base_servings"));
		const id = recipes.insert({
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
			base_servings: baseServings,
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

	function parseIds(values: FormDataEntryValue[]): number[] {
		const ids: number[] = [];
		for (const v of values) {
			const n = Number(String(v));
			if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
		}
		return ids;
	}

	function formFilter(form: FormData) {
		return {
			q: String(form.get("q") ?? ""),
			tags: form
				.getAll("tag")
				.map((s) => String(s))
				.filter(Boolean),
			sort: String(form.get("sort") ?? ""),
		};
	}

	function parseServings(raw: FormDataEntryValue | null): number | null {
		const n = Number(String(raw ?? ""));
		if (!Number.isFinite(n) || n <= 0) return null;
		return Math.round(n);
	}

	app.post("/recipes/bulk-delete", async (c) => {
		const { recipes } = repos(c);
		const form = await c.req.formData();
		const ids = parseIds(form.getAll("ids"));
		if (ids.length === 0) return c.body("no ids", 400);
		recipes.softDeleteMany(ids);
		const n = ids.length;
		const toast = `Deleted ${n} recipe${n === 1 ? "" : "s"}.`;
		if (c.req.header("HX-Request") === "true") {
			const grid = libraryGridHtml(libraryList(c, formFilter(form)));
			const toastHtml = render("partials/toast.html", {
				toast,
				undo_url: "/recipes/bulk-restore",
				undo_ids: ids,
			});
			return c.html(`${grid}<div id="toast-area" hx-swap-oob="true">${toastHtml}</div>`);
		}
		return c.redirect(`/recipes?toast=${encodeURIComponent(toast)}`);
	});

	app.post("/recipes/bulk-restore", async (c) => {
		const { recipes } = repos(c);
		const form = await c.req.formData();
		const ids = parseIds(form.getAll("ids"));
		if (ids.length === 0) return c.body("no ids", 400);
		recipes.restoreMany(ids);
		if (c.req.header("HX-Request") === "true") {
			return c.html(
				`${libraryGridHtml(libraryList(c, formFilter(form)))}<div id="toast-area" hx-swap-oob="true"></div>`,
			);
		}
		return c.redirect("/recipes");
	});

	app.get("/recipes/:id", (c) => {
		const { recipes, tags } = repos(c);
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
		const { recipes, tags } = repos(c);
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe) return c.notFound();
		const tagRows = tags.listForRecipe(id);
		const mode = c.req.query("mode") ?? "";
		const error = c.req.query("error") ?? "";
		return c.html(
			render("recipe-edit.html", {
				r: recipe,
				tags: tagRows.map((t) => t.name),
				ingredients_text: recipe.ingredients.join("\n"),
				steps_text: recipe.steps.join("\n"),
				edit_mode: mode,
				error,
				title: `Edit ${recipe.title}`,
				...themeVars(c),
			}),
		);
	});

	app.post("/recipes/:id", async (c) => {
		const { recipes, tags } = repos(c);
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
		const baseServings = parseServings(form.get("base_servings"));

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
			base_servings: baseServings,
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
		const { recipes } = repos(c);
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
		const { recipes } = repos(c);
		const id = Number(c.req.param("id"));
		const recipe = recipes.getById(id);
		if (!recipe) return c.notFound();
		recipes.restore(id);
		return c.redirect(`/recipes/${id}`);
	});

	app.post("/recipes/:id/rating", async (c) => {
		const { recipes } = repos(c);
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
		const { recipes } = repos(c);
		const id = Number(c.req.param("id"));
		const existing = recipes.getById(id);
		if (!existing) return c.notFound();
		recipes.update(id, { favorite: !existing.favorite });
		const updated = recipes.getById(id);
		if (!updated) return c.notFound();
		const favCount = (
			db
				.query(
					"SELECT COUNT(*) AS c FROM recipes WHERE favorite = 1 AND deleted_at IS NULL AND owner_id = ?",
				)
				.get(c.get("userId")) as { c: number }
		).c;
		const btn = render("partials/favorite-btn.html", { r: updated });
		const oob = `<span id="fav-count" class="count opacity-70" hx-swap-oob="true">${favCount}</span>`;
		return c.html(btn + oob);
	});

	return app;
}
