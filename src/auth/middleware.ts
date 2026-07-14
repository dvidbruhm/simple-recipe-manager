import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Config } from "@/config";
import { SESSION_COOKIE_NAME, verifySessionCookie } from "./session";

const PUBLIC_EXACT = new Set(["/login"]);
const PUBLIC_PREFIX = ["/static/"];

export function authMiddleware(config: Config): MiddlewareHandler {
	return async (c, next) => {
		const path = c.req.path;
		if (PUBLIC_EXACT.has(path) || PUBLIC_PREFIX.some((p) => path.startsWith(p))) {
			return next();
		}
		const cookie = getCookie(c, SESSION_COOKIE_NAME);
		if (cookie && (await verifySessionCookie(cookie, config.sessionSecret))) {
			return next();
		}
		const returnParam = encodeURIComponent(path);
		return c.redirect(`/login?return=${returnParam}`);
	};
}
