import type { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ZipArchive } from "archiver";
import { Hono } from "hono";
import type { Config } from "@/config";
import { RecipeRepository } from "@/recipes/repository";
import { TagRepository } from "@/tags/repository";
import { jsonLdFilename, recipeToJsonLd } from "./jsonld";
import { type RecipeWithTags, recipeFilename, renderRecipeMarkdown } from "./markdown";
import { renderPdf } from "./pdf";

export function exportRoutes(db: Database, config: Config): Hono {
	const app = new Hono();
	const recipes = new RecipeRepository(db);
	const tagRepo = new TagRepository(db);

	app.get("/export/formats/:format", async (c) => {
		const fmt = c.req.param("format");
		const list = recipes.list();

		if (fmt === "pdf") {
			const withTags: RecipeWithTags[] = list.map((r) => ({
				...r,
				tags: tagRepo.listForRecipe(r.id).map((t) => t.name),
			}));
			const arrayBuf = await renderPdf(withTags, config.dataDir);
			const today = new Date().toISOString().slice(0, 10);
			c.header("Content-Type", "application/pdf");
			c.header("Content-Disposition", `attachment; filename="recipes-${today}.pdf"`);
			return c.body(arrayBuf);
		}

		if (fmt === "json") {
			const withTags: RecipeWithTags[] = list.map((r) => ({
				...r,
				tags: tagRepo.listForRecipe(r.id).map((t) => t.name),
			}));
			const json = JSON.stringify(
				withTags.map((r) => recipeToJsonLd(r)),
				null,
				2,
			);
			const today = new Date().toISOString().slice(0, 10);
			c.header("Content-Type", "application/json");
			c.header("Content-Disposition", `attachment; filename="recipes-${today}.json"`);
			return c.body(json);
		}

		if (fmt === "json-ld-zip") {
			const withTags: RecipeWithTags[] = list.map((r) => ({
				...r,
				tags: tagRepo.listForRecipe(r.id).map((t) => t.name),
			}));

			const tmpDir = mkdtempSync(join(tmpdir(), "rm-export-"));
			try {
				const imageDir = join(tmpDir, "images");
				await Bun.write(
					join(tmpDir, "manifest.json"),
					JSON.stringify(
						{
							format: "recipe-manager-jsonld",
							version: 1,
							count: withTags.length,
							exported_at: new Date().toISOString(),
							files: withTags.map((r, i) => jsonLdFilename(r, i)),
						},
						null,
						2,
					),
				);

				for (let i = 0; i < withTags.length; i++) {
					const r = withTags[i];
					if (!r) continue;
					const jsonld = recipeToJsonLd(r);
					await Bun.write(join(tmpDir, jsonLdFilename(r, i)), JSON.stringify(jsonld, null, 2));
				}

				if (withTags.some((r) => r.image_filename)) {
					await Bun.write(join(imageDir, ".gitkeep"), "");
					for (const r of withTags) {
						if (!r.image_filename) continue;
						const src = join(config.dataDir, "images", r.image_filename);
						if (existsSync(src)) {
							const buf = readFileSync(src);
							await Bun.write(join(imageDir, r.image_filename), buf);
						}
					}
				}

				const arrayBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
					const archive = new ZipArchive({ zlib: { level: 6 } });
					const chunks: Buffer[] = [];
					archive.on("data", (c: Buffer) => chunks.push(c));
					archive.on("end", () => {
						const full = Buffer.concat(chunks);
						const ab = new ArrayBuffer(full.byteLength);
						new Uint8Array(ab).set(full);
						resolve(ab);
					});
					archive.on("error", reject);
					archive.directory(tmpDir, false);
					archive.finalize();
				});

				const today = new Date().toISOString().slice(0, 10);
				c.header("Content-Type", "application/zip");
				c.header("Content-Disposition", `attachment; filename="recipes-${today}.jsonld.zip"`);
				return c.body(arrayBuf);
			} finally {
				rmSync(tmpDir, { recursive: true, force: true });
			}
		}

		if (fmt !== "md-zip") {
			return c.body(`Unsupported format: ${fmt}`, 400);
		}
		const withTags: RecipeWithTags[] = list.map((r) => ({
			...r,
			tags: tagRepo.listForRecipe(r.id).map((t) => t.name),
		}));

		const tmpDir = mkdtempSync(join(tmpdir(), "rm-export-"));
		try {
			const imageDir = join(tmpDir, "images");
			await Bun.write(
				join(tmpDir, "manifest.json"),
				JSON.stringify(
					{
						format: "recipe-manager-markdown",
						version: 1,
						count: withTags.length,
						exported_at: new Date().toISOString(),
					},
					null,
					2,
				),
			);

			for (let i = 0; i < withTags.length; i++) {
				const r = withTags[i];
				if (!r) continue;
				const md = renderRecipeMarkdown(r);
				const filename = recipeFilename(r, i);
				await Bun.write(join(tmpDir, filename), md);
			}

			if (withTags.some((r) => r.image_filename)) {
				await Bun.write(join(imageDir, ".gitkeep"), "");
				for (const r of withTags) {
					if (!r.image_filename) continue;
					const src = join(config.dataDir, "images", r.image_filename);
					if (existsSync(src)) {
						const buf = readFileSync(src);
						await Bun.write(join(imageDir, r.image_filename), buf);
					}
				}
			}

			const arrayBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
				const archive = new ZipArchive({ zlib: { level: 6 } });
				const chunks: Buffer[] = [];
				archive.on("data", (c: Buffer) => chunks.push(c));
				archive.on("end", () => {
					const full = Buffer.concat(chunks);
					const ab = new ArrayBuffer(full.byteLength);
					new Uint8Array(ab).set(full);
					resolve(ab);
				});
				archive.on("error", reject);
				archive.directory(tmpDir, false);
				archive.finalize();
			});

			const today = new Date().toISOString().slice(0, 10);
			c.header("Content-Type", "application/zip");
			c.header("Content-Disposition", `attachment; filename="recipes-${today}.md.zip"`);
			return c.body(arrayBuf);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	return app;
}
