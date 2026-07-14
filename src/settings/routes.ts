import type { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { Config } from "@/config";
import { detectDuplicates } from "@/import/duplicate-detector";
import type { PartialRecipe } from "@/import/extractor";
import { pickAdapter } from "@/import/file-importers";
import { downloadImage } from "@/import/image";
import { previewSessions } from "@/import/preview-session";
import type { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";

export function settingsRoutes(db: Database, config: Config, recipes: RecipeRepository): Hono {
	const app = new Hono();
	const tagRepo = new TagRepository(db);

	app.get("/settings", (c) => {
		return c.html(
			render("settings.html", {
				...themeVars(c),
				title: "Settings",
			}),
		);
	});

	app.post("/settings/import/preview", async (c) => {
		const body = await c.req.parseBody();
		const file = body.file;
		if (!(file instanceof File)) {
			return c.html("No file uploaded", 400);
		}
		const buf = new Uint8Array(await file.arrayBuffer());
		const adapter = pickAdapter(file.name, file.type);
		if (!adapter) {
			return c.html(`Unsupported file type: ${file.name}`, 400);
		}

		const tempDir = mkdtempSync(join(tmpdir(), "rm-import-"));
		try {
			const parsedRecipes = await adapter.parse(buf, { tempDir });
			const detections = detectDuplicates(db, parsedRecipes);

			const sessionId = previewSessions.create({
				recipes: parsedRecipes,
				detections,
				filename: file.name,
			});

			return c.html(
				render("settings-preview.html", {
					...themeVars(c),
					title: "Import Preview",
					session_id: sessionId,
					filename: file.name,
					recipes: parsedRecipes.map((r, i) => ({
						title: r.title ?? "(untitled)",
						source_url: r.source_url ?? "",
						status: detections[i],
					})),
					new_count: detections.filter((d) => d.status === "new").length,
					dup_count: detections.filter((d) => d.status === "duplicate").length,
				}),
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	app.post("/settings/import/commit", async (c) => {
		const body = await c.req.parseBody();
		const sessionId = String(body.session ?? "");
		const session = previewSessions.get(sessionId);
		if (!session) {
			return c.html("Session expired or invalid. Please re-upload the file.", 400);
		}

		let importedCount = 0;
		let replacedCount = 0;

		for (let i = 0; i < session.recipes.length; i++) {
			const recipe = session.recipes[i];
			const detection = session.detections[i];
			if (!recipe || !detection) continue;

			const decisionKey = `decision_${i}`;
			const decision = String(body[decisionKey] ?? "");

			if (detection.status === "new") {
				if (decision === "skip") continue;
				await insertRecipe(recipes, tagRepo, config, recipe);
				importedCount++;
			} else if (detection.status === "duplicate") {
				if (decision.startsWith("replace_")) {
					const existingId = Number(decision.substring("replace_".length));
					if (Number.isFinite(existingId) && existingId > 0) {
						await replaceRecipe(recipes, tagRepo, config, existingId, recipe);
						replacedCount++;
					}
				}
			}
		}

		previewSessions.delete(sessionId);
		const toast = `Imported ${importedCount} new, replaced ${replacedCount}`;
		return c.redirect(`/recipes?toast=${encodeURIComponent(toast)}`);
	});

	return app;
}

async function insertRecipe(
	recipes: RecipeRepository,
	tagRepo: TagRepository,
	config: Config,
	recipe: PartialRecipe,
): Promise<void> {
	const id = recipes.insert({
		title: recipe.title ?? "",
		description: recipe.description ?? "",
		ingredients: recipe.ingredients ?? [],
		steps: recipe.steps ?? [],
		notes: recipe.notes ?? "",
		source_url: recipe.source_url ?? "",
		rating: recipe.rating ?? 0,
	});
	if (recipe.tags && recipe.tags.length > 0) {
		tagRepo.replaceForRecipe(id, recipe.tags);
	}
	if (recipe.image) {
		const filename = await downloadImage(config.dataDir, recipe.image);
		if (filename) {
			recipes.update(id, { image_filename: filename });
		}
	}
}

async function replaceRecipe(
	recipes: RecipeRepository,
	tagRepo: TagRepository,
	config: Config,
	existingId: number,
	recipe: PartialRecipe,
): Promise<void> {
	recipes.update(existingId, {
		title: recipe.title ?? "",
		description: recipe.description ?? "",
		ingredients: recipe.ingredients ?? [],
		steps: recipe.steps ?? [],
		notes: recipe.notes ?? "",
		source_url: recipe.source_url ?? "",
		rating: recipe.rating ?? 0,
	});
	if (recipe.tags) {
		tagRepo.replaceForRecipe(existingId, recipe.tags);
	}
	if (recipe.image) {
		const filename = await downloadImage(config.dataDir, recipe.image);
		if (filename) {
			recipes.update(existingId, { image_filename: filename });
		}
	}
}
