import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { App, Ctx } from "@/app";
import { buildSmtpMailer } from "@/auth/email";
import { authMiddleware } from "@/auth/middleware";
import { RateLimiter } from "@/auth/rate-limit";
import { authRoutes } from "@/auth/routes";
import { type Config, loadConfig } from "@/config";
import { openDatabase } from "@/db/connection";
import { exportRoutes } from "@/export/routes";
import { importRoutes } from "@/import/routes";
import { RecipeRepository } from "@/recipes/repository";
import { recipeRoutes } from "@/recipes/routes";
import { settingsRoutes } from "@/settings/routes";
import { tagRoutes } from "@/tags/routes";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";

const IMAGE_MIME: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
};

function userIdFrom(c: Ctx): number {
	const id = c.get("userId");
	if (typeof id !== "number" || !Number.isFinite(id)) {
		throw new Error("userId missing from context");
	}
	return id;
}

export function buildApp(opts?: { config?: Config; dataDir?: string }): App {
	const config = opts?.config ?? loadConfig();
	const dataDir = opts?.dataDir ?? config.dataDir;
	const db = openDatabase(dataDir);
	const rateLimiter = new RateLimiter({ capacity: 10, refillPerSecond: 10 });
	const mailer = buildSmtpMailer(config.smtp);
	const app: App = new Hono();

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
	app.route("/", authRoutes({ config, db, mailer, rateLimiter }));
	app.route(
		"/",
		importRoutes(config, (c) => new RecipeRepository(db, userIdFrom(c))),
	);
	app.route("/", exportRoutes(db, config, userIdFrom));
	app.route("/", recipeRoutes(db, config));
	app.route("/", settingsRoutes(db, config, userIdFrom));
	app.route("/", tagRoutes(db));

	app.notFound((c) =>
		c.html(
			renderErrorPage(
				c,
				404,
				"Page not found",
				"The page you're looking for doesn't exist or may have been moved.",
			),
			404,
		),
	);

	app.onError((err, c) => {
		console.error("Unhandled error:", err);
		const rawStatus =
			err &&
			typeof err === "object" &&
			"status" in err &&
			typeof (err as { status: unknown }).status === "number"
				? (err as { status: number }).status
				: 500;
		const status = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
		const message =
			status >= 500
				? "Something went wrong on our side. Please try again in a moment."
				: err instanceof Error
					? err.message
					: "Unexpected error.";
		return c.html(
			renderErrorPage(
				c,
				status,
				status === 404 ? "Page not found" : "Something went wrong",
				message,
			),
			status as 400,
		);
	});

	return app;
}

function renderErrorPage(c: Ctx, status: number, titleText: string, message: string): string {
	const isHtmx = c.req.header("HX-Request") === "true";
	if (isHtmx) {
		return `<div class="error-htmx" role="alert" style="padding:1rem;border:1px solid var(--color-border);border-radius:4px;background:var(--color-surface);color:var(--color-text)">
	<strong>${status}.</strong> ${message}
	<span style="margin-left:auto"><a href="/recipes" class="btn">Back to recipes</a></span>
</div>`;
	}
	return render("error.html", {
		status: String(status),
		title_text: titleText,
		message,
		title: `${status} ${titleText}`,
		...themeVars(c),
	});
}

let _app: App | null = null;

function getApp(): App {
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
