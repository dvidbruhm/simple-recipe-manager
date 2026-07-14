import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authMiddleware } from "@/auth/middleware";
import { authRoutes } from "@/auth/routes";
import { type Config, loadConfig } from "@/config";
import { openDatabase } from "@/db/connection";
import { recipeRoutes } from "@/recipes/routes";

export function buildApp(opts?: { config?: Config; dataDir?: string }) {
	const config = opts?.config ?? loadConfig();
	const db = openDatabase(opts?.dataDir ?? config.dataDir);
	const app = new Hono();

	app.use("/static/*", serveStatic({ root: "./src/ui/" }));
	app.get("/manifest.webmanifest", serveStatic({ path: "./src/ui/static/manifest.webmanifest" }));
	app.get("/sw.js", serveStatic({ path: "./src/ui/static/sw.js" }));

	app.use("*", authMiddleware(config));
	app.route("/", authRoutes(config));
	app.route("/", recipeRoutes(db, config));

	return app;
}

let _app: Hono | null = null;

function getApp(): Hono {
	if (_app === null) _app = buildApp();
	return _app;
}

export default {
	port: 3000,
	hostname: "0.0.0.0",
	fetch: (req: Request, env?: unknown) => getApp().fetch(req, env as Response),
};
