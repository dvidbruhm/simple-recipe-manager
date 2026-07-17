export interface Config {
	appPassword: string;
	sessionSecret: string;
	port: number;
	dataDir: string;
	fetchProxy: string;
}

const DEFAULT_FETCH_PROXY = "https://r.jina.ai/{url}";

export const APP_VERSION = "1.0.0";
export const GITHUB_URL = "https://github.com/dvidbruhm/simple-recipe-manager";

export function loadConfig(): Config {
	const appPassword = process.env.APP_PASSWORD ?? "";
	if (!appPassword) {
		throw new Error("FATAL: APP_PASSWORD environment variable must be set and non-empty.");
	}
	return {
		appPassword,
		sessionSecret: process.env.SESSION_SECRET || appPassword,
		port: Number(process.env.PORT ?? 3000),
		dataDir: process.env.DATA_DIR ?? "/data",
		fetchProxy: process.env.FETCH_PROXY ?? DEFAULT_FETCH_PROXY,
	};
}
