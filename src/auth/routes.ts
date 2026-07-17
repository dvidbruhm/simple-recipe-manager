import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Config } from "@/config";
import { render } from "@/ui/nunjucks";
import { themeVars } from "@/ui/theme";
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./session";

export function authRoutes(config: Config): Hono {
	const app = new Hono();

	app.get("/login", (c) => {
		const returnTo = c.req.query("return") ?? "/recipes";
		return c.html(render("login.html", { return_to: returnTo, ...themeVars(c) }));
	});

	app.post("/login", async (c) => {
		const body = await c.req.parseBody();
		const password = String(body.password ?? "");
		const returnTo = String(body.return ?? "/recipes");
		const a = new TextEncoder().encode(password);
		const b = new TextEncoder().encode(config.appPassword);
		if (a.length !== b.length) return c.body("Unauthorized", 401);
		let diff = 0;
		for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
		if (diff !== 0) return c.body("Unauthorized", 401);
		const cookie = await createSessionCookie(config.sessionSecret, SESSION_TTL_SECONDS);
		setCookie(c, SESSION_COOKIE_NAME, cookie, {
			httpOnly: true,
			sameSite: "Lax",
			secure: c.req.header("X-Forwarded-Proto") === "https",
			path: "/",
			maxAge: SESSION_TTL_SECONDS,
		});
		return c.redirect(returnTo);
	});

	app.post("/logout", (c) => {
		setCookie(c, SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
		return c.redirect("/login");
	});

	app.post("/theme", async (c) => {
		const body = await c.req.parseBody();
		const theme = String(body.theme ?? "");
		if (theme !== "light" && theme !== "dark") return c.body("Bad theme", 400);
		setCookie(c, "theme", theme, {
			httpOnly: false,
			sameSite: "Lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
		return c.redirect(c.req.header("Referer") ?? "/recipes");
	});

	app.post("/view", async (c) => {
		const body = await c.req.parseBody();
		const view = String(body.view ?? "");
		if (view !== "cards" && view !== "list") return c.body("Bad view", 400);
		setCookie(c, "view", view, {
			httpOnly: false,
			sameSite: "Lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
		return c.redirect(c.req.header("Referer") ?? "/recipes");
	});

	return app;
}
