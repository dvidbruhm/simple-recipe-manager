import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authMiddleware } from "@/auth/middleware";
import { authRoutes } from "@/auth/routes";
import { type Config, loadConfig } from "@/config";
import { openDatabase } from "@/db/connection";
import { exportRoutes } from "@/export/routes";
import { importRoutes } from "@/import/routes";
import { RecipeRepository } from "@/recipes/repository";
import { recipeRoutes } from "@/recipes/routes";
import { settingsRoutes } from "@/settings/routes";
import { tagRoutes } from "@/tags/routes";

const IMAGE_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
};

export function buildApp(opts?: { config?: Config; dataDir?: string }) {
	const config = opts?.config ?? loadConfig();
	const dataDir = opts?.dataDir ?? config.dataDir;
	const db = openDatabase(dataDir);
	const app = new Hono();

	app.get("/static/images/:filename", async (c) => {
		const filename = c.req.param("filename");
		if (!/^[A-Za-z0-9._-]+$/.test(filename)) return c.notFound();
		const fullPath = join(dataDir, "images", filename);
		if (!existsSync(fullPath)) return c.notFound();
		const buf = await readFile(fullPath);
		const ext = filename.split(".").pop()?.toLowerCase() ?? "";
		const ct = IMAGE_MIME[ext] ?? "application/octet-stream";
		return new Response(buf, {
			headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400" },
		});
	});

	app.use("/static/*", serveStatic({ root: "./src/ui/" }));
	app.get("/manifest.webmanifest", serveStatic({ path: "./src/ui/static/manifest.webmanifest" }));
	app.get("/sw.js", serveStatic({ path: "./src/ui/static/sw.js" }));

	app.get("/", (c) => c.redirect("/recipes"));

	app.use("*", authMiddleware(config));
	app.route("/", authRoutes(config));
	app.route("/", importRoutes(config, new RecipeRepository(db)));
	app.route("/", exportRoutes(db, config));
	app.route("/", recipeRoutes(db, config));
	app.route("/", settingsRoutes(db, config, new RecipeRepository(db)));
	app.route("/", tagRoutes(db));

	return app;
}

let _app: Hono | null = null;

function getApp(): Hono {
	if (_app === null) _app = buildApp();
	return _app;
}

let _bootConfig: Config | null = null;

function bootConfig(): Config {
	if (_bootConfig === null) _bootConfig = loadConfig();
	return _bootConfig;
}

export default {
	get port() {
		return bootConfig().port;
	},
	hostname: "0.0.0.0",
	fetch: (req: Request, env?: unknown) => getApp().fetch(req, env as Response),
};
