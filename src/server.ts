import { Hono } from "hono";
import { authMiddleware } from "@/auth/middleware";
import { authRoutes } from "@/auth/routes";
import { type Config, loadConfig } from "@/config";
import { openDatabase } from "@/db/connection";

export function buildApp(opts?: { config?: Config; dataDir?: string }) {
	const config = opts?.config ?? loadConfig();
	openDatabase(opts?.dataDir ?? config.dataDir);
	const app = new Hono();

	app.use("*", authMiddleware(config));
	app.route("/", authRoutes(config));

	app.get("/recipes", (c) => c.text("library placeholder"));

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
