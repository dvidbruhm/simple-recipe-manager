export interface Config {
	appPassword: string;
	sessionSecret: string;
	port: number;
	dataDir: string;
}

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
	};
}
