export interface SmtpConfig {
	host: string;
	port: number;
	user: string | null;
	pass: string | null;
	from: string;
	secure: boolean;
}

export interface Config {
	sessionSecret: string;
	port: number;
	dataDir: string;
	fetchProxy: string;
	appBaseUrl: string;
	smtp: SmtpConfig;
}

const DEFAULT_FETCH_PROXY = "https://r.jina.ai/{url}";

export const APP_VERSION = "1.0.0";
export const GITHUB_URL = "https://github.com/dvidbruhm/simple-recipe-manager";

function parseBaseURL(raw: string): string {
	let v = raw.trim();
	if (v.endsWith("/")) v = v.slice(0, -1);
	try {
		const parsed = new URL(v);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			throw new Error("must be http or https");
		}
	} catch (e) {
		throw new Error(`FATAL: APP_BASE_URL is invalid (${(e as Error).message}).`);
	}
	return v;
}

export function loadConfig(): Config {
	const sessionSecret = process.env.SESSION_SECRET ?? "";
	if (!sessionSecret) {
		throw new Error("FATAL: SESSION_SECRET environment variable must be set and non-empty.");
	}
	const appBaseUrlRaw = process.env.APP_BASE_URL ?? "";
	if (!appBaseUrlRaw) {
		throw new Error(
			"FATAL: APP_BASE_URL environment variable must be set (e.g. http://localhost:3000).",
		);
	}
	const appBaseUrl = parseBaseURL(appBaseUrlRaw);

	const smtpHost = process.env.SMTP_HOST ?? "";
	if (!smtpHost) {
		throw new Error(
			"FATAL: SMTP_HOST environment variable must be set (used for password reset emails).",
		);
	}
	const smtpFrom = process.env.SMTP_FROM ?? "";
	if (!smtpFrom) {
		throw new Error(
			"FATAL: SMTP_FROM environment variable must be set (e.g. 'Recipe Manager <noreply@example.com>').",
		);
	}

	const smtpUser = process.env.SMTP_USER?.trim() || null;
	const smtpPass = process.env.SMTP_PASS ?? null;
	const smtpSecure = process.env.SMTP_SECURE === "true";
	const smtpPort = Number(process.env.SMTP_PORT ?? (smtpSecure ? 465 : 587));

	return {
		sessionSecret,
		port: Number(process.env.PORT ?? 3000),
		dataDir: process.env.DATA_DIR ?? "/data",
		fetchProxy: process.env.FETCH_PROXY ?? DEFAULT_FETCH_PROXY,
		appBaseUrl,
		smtp: {
			host: smtpHost,
			port: smtpPort,
			user: smtpUser,
			pass: smtpPass,
			from: smtpFrom,
			secure: smtpSecure,
		},
	};
}
