import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import type { App, Ctx } from "@/app";
import type { Config } from "@/config";
import { render } from "@/ui/nunjucks";
import { THEMES, themeVars } from "@/ui/theme";
import type { Mailer } from "./email";
import { verifyPassword } from "./password";
import { clientIp, type RateLimiter } from "./rate-limit";
import { PasswordResetRepository } from "./reset";
import { createSessionCookie, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "./session";
import { DuplicateEmailError, UserRepository } from "./users";

const EMAIL_SCHEMA = z.string().trim().toLowerCase().email().max(254);
const PASSWORD_SCHEMA = z.string().min(8, "Password must be at least 8 characters").max(1024);
const TOKEN_SCHEMA = z.string().min(10).max(200);

export interface AuthDeps {
	config: Config;
	db: Database;
	mailer: Mailer;
	rateLimiter: RateLimiter;
}

function applySessionCookie(c: Ctx, cookie: string): void {
	setCookie(c, SESSION_COOKIE_NAME, cookie, {
		httpOnly: true,
		sameSite: "Lax",
		secure: c.req.header("X-Forwarded-Proto") === "https",
		path: "/",
		maxAge: SESSION_TTL_SECONDS,
	});
}

function clearSessionCookie(c: Ctx): void {
	setCookie(c, SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

function safeReturnPath(raw: string): string {
	return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/recipes";
}

export function authRoutes(deps: AuthDeps): App {
	const { config, db, mailer, rateLimiter } = deps;
	const users = new UserRepository(db);
	const resets = new PasswordResetRepository(db);
	const app: App = new Hono();

	function rateLimited(c: Ctx) {
		return rateLimiter.check(clientIp(c.req.raw), 1);
	}

	function rateLimitedResponse(retryAfter: number): Response {
		return new Response("Too many requests", {
			status: 429,
			headers: { "Retry-After": String(retryAfter) },
		});
	}

	app.get("/register", (c) => {
		return c.html(
			render("register.html", {
				...themeVars(c),
				title: "Create account",
				error: "",
				email: "",
			}),
		);
	});

	app.post("/register", async (c) => {
		const limit = rateLimited(c);
		if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

		const body = await c.req.parseBody();
		const email = String(body.email ?? "");
		const password = String(body.password ?? "");

		const emailParsed = EMAIL_SCHEMA.safeParse(email);
		const passwordParsed = PASSWORD_SCHEMA.safeParse(password);

		if (!emailParsed.success) {
			return c.html(
				render("register.html", {
					...themeVars(c),
					title: "Create account",
					error: "Please enter a valid email address.",
					email,
				}),
				400,
			);
		}
		if (!passwordParsed.success) {
			return c.html(
				render("register.html", {
					...themeVars(c),
					title: "Create account",
					error: passwordParsed.error.issues[0]?.message ?? "Invalid password.",
					email,
				}),
				400,
			);
		}

		let user: { id: number };
		try {
			user = users.create({ email: emailParsed.data, password: passwordParsed.data });
		} catch (e) {
			if (e instanceof DuplicateEmailError) {
				return c.html(
					render("register.html", {
						...themeVars(c),
						title: "Create account",
						error: "An account with that email already exists.",
						email,
					}),
					409,
				);
			}
			throw e;
		}

		const cookie = await createSessionCookie(config.sessionSecret, SESSION_TTL_SECONDS, user.id);
		applySessionCookie(c, cookie);
		return c.redirect("/recipes");
	});

	app.get("/login", (c) => {
		const returnTo = safeReturnPath(c.req.query("return") ?? "/recipes");
		return c.html(
			render("login.html", {
				...themeVars(c),
				title: "Sign in",
				return_to: returnTo,
				error: "",
				email: "",
			}),
		);
	});

	app.post("/login", async (c) => {
		const limit = rateLimited(c);
		if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

		const body = await c.req.parseBody();
		const email = String(body.email ?? "");
		const password = String(body.password ?? "");
		const returnTo = safeReturnPath(String(body.return ?? "/recipes"));

		const user = users.findByEmail(email);
		const ok = user && verifyPassword(password, user.password_hash, user.password_salt);

		if (!user || !ok) {
			return c.html(
				render("login.html", {
					...themeVars(c),
					title: "Sign in",
					return_to: returnTo,
					error: "Invalid email or password.",
					email,
				}),
				401,
			);
		}

		const cookie = await createSessionCookie(config.sessionSecret, SESSION_TTL_SECONDS, user.id);
		applySessionCookie(c, cookie);
		return c.redirect(returnTo);
	});

	app.get("/forgot", (c) => {
		return c.html(
			render("forgot.html", {
				...themeVars(c),
				title: "Reset your password",
				email: "",
			}),
		);
	});

	app.post("/forgot", async (c) => {
		const limit = rateLimited(c);
		if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

		const body = await c.req.parseBody();
		const email = String(body.email ?? "");
		const emailParsed = EMAIL_SCHEMA.safeParse(email);

		if (emailParsed.success) {
			const user = users.findByEmail(emailParsed.data);
			if (user) {
				try {
					const issued = resets.issue(user.id);
					const resetUrl = `${config.appBaseUrl}/reset?token=${encodeURIComponent(issued.token)}`;
					await mailer.sendResetEmail(user.email, resetUrl);
				} catch {
					// swallow: never reveal SMTP failure to the client
				}
			}
		}
		return c.redirect("/forgot/sent");
	});

	app.get("/forgot/sent", (c) => {
		return c.html(
			render("forgot-sent.html", {
				...themeVars(c),
				title: "Check your email",
			}),
		);
	});

	app.get("/reset", (c) => {
		const tokenRaw = c.req.query("token") ?? "";
		const tokenParsed = TOKEN_SCHEMA.safeParse(tokenRaw);
		let tokenError = "";
		if (!tokenParsed.success) {
			tokenError = "The reset link is invalid. Please request a new one.";
		} else {
			const verified = resets.verify(tokenParsed.data);
			if (!verified) {
				tokenError =
					"The reset link is invalid, expired, or already used. Please request a new one.";
			}
		}
		return c.html(
			render("reset.html", {
				...themeVars(c),
				title: "Set a new password",
				token: tokenParsed.success ? tokenParsed.data : "",
				token_error: tokenError,
				password_error: "",
			}),
		);
	});

	app.post("/reset", async (c) => {
		const limit = rateLimited(c);
		if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

		const body = await c.req.parseBody();
		const token = String(body.token ?? "");
		const password = String(body.password ?? "");

		const tokenParsed = TOKEN_SCHEMA.safeParse(token);
		const passwordParsed = PASSWORD_SCHEMA.safeParse(password);

		const renderReset = (ctx: {
			token: string;
			token_error: string;
			password_error: string;
			status: 400 | 409 | 401;
		}) =>
			c.html(
				render("reset.html", {
					...themeVars(c),
					title: "Set a new password",
					token: ctx.token,
					token_error: ctx.token_error,
					password_error: ctx.password_error,
				}),
				ctx.status,
			);

		if (!tokenParsed.success) {
			return renderReset({
				token: "",
				token_error: "The reset link is invalid. Please request a new one.",
				password_error: "",
				status: 400,
			});
		}

		const verified = resets.verify(tokenParsed.data);
		if (!verified) {
			return renderReset({
				token: "",
				token_error:
					"The reset link is invalid, expired, or already used. Please request a new one.",
				password_error: "",
				status: 400,
			});
		}

		if (!passwordParsed.success) {
			return renderReset({
				token: tokenParsed.data,
				token_error: "",
				password_error: passwordParsed.error.issues[0]?.message ?? "Invalid password.",
				status: 400,
			});
		}

		users.updatePassword(verified.userId, passwordParsed.data);
		resets.consume(tokenParsed.data);
		resets.deleteAllForUser(verified.userId);
		return c.redirect("/login");
	});

	app.post("/logout", (c) => {
		clearSessionCookie(c);
		return c.redirect("/login");
	});

	app.post("/theme", async (c) => {
		const body = await c.req.parseBody();
		const theme = String(body.theme ?? "");
		const mode = String(body.mode ?? "");
		const validTheme = (THEMES as readonly string[]).includes(theme);
		const validMode = mode === "light" || mode === "dark";
		if (!validTheme || !validMode) return c.body("Bad theme", 400);
		setCookie(c, "theme", theme, {
			httpOnly: false,
			sameSite: "Lax",
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
		});
		setCookie(c, "mode", mode, {
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
