import { loadConfig } from "@/config";

describe("loadConfig", () => {
	const origEnv = { ...process.env };
	beforeEach(() => {
		process.env = { ...origEnv };
	});
	afterEach(() => {
		process.env = origEnv;
	});

	it("returns valid config when APP_PASSWORD is set", () => {
		process.env.APP_PASSWORD = "hunter2";
		process.env.PORT = "4242";
		process.env.DATA_DIR = "/tmp/x";
		const cfg = loadConfig();
		expect(cfg.appPassword).toBe("hunter2");
		expect(cfg.port).toBe(4242);
		expect(cfg.dataDir).toBe("/tmp/x");
	});

	it("throws when APP_PASSWORD is empty", () => {
		process.env.APP_PASSWORD = "";
		expect(() => loadConfig()).toThrow(/APP_PASSWORD/);
	});

	it("throws when APP_PASSWORD is unset", () => {
		delete process.env.APP_PASSWORD;
		expect(() => loadConfig()).toThrow(/APP_PASSWORD/);
	});

	it("defaults: PORT=3000, DATA_DIR=/data, SESSION_SECRET=APP_PASSWORD", () => {
		process.env.APP_PASSWORD = "pw";
		delete process.env.PORT;
		delete process.env.DATA_DIR;
		delete process.env.SESSION_SECRET;
		const cfg = loadConfig();
		expect(cfg.port).toBe(3000);
		expect(cfg.dataDir).toBe("/data");
		expect(cfg.sessionSecret).toBe("pw");
	});
});
