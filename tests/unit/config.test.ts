import { loadConfig } from "@/config";

describe("loadConfig", () => {
	const origEnv = { ...process.env };
	beforeEach(() => {
		process.env = { ...origEnv };
	});
	afterEach(() => {
		process.env = origEnv;
	});

	function setRequired() {
		process.env.SESSION_SECRET = "secret";
		process.env.APP_BASE_URL = "http://localhost:3000";
		process.env.SMTP_HOST = "smtp.example.com";
		process.env.SMTP_FROM = "noreply@example.com";
	}

	it("returns valid config when required vars are set", () => {
		setRequired();
		process.env.PORT = "4242";
		process.env.DATA_DIR = "/tmp/x";
		const cfg = loadConfig();
		expect(cfg.sessionSecret).toBe("secret");
		expect(cfg.appBaseUrl).toBe("http://localhost:3000");
		expect(cfg.smtp.host).toBe("smtp.example.com");
		expect(cfg.smtp.from).toBe("noreply@example.com");
		expect(cfg.port).toBe(4242);
		expect(cfg.dataDir).toBe("/tmp/x");
	});

	it("strips trailing slash from APP_BASE_URL", () => {
		setRequired();
		process.env.APP_BASE_URL = "http://localhost:3000/";
		const cfg = loadConfig();
		expect(cfg.appBaseUrl).toBe("http://localhost:3000");
	});

	it("throws when SESSION_SECRET is missing", () => {
		setRequired();
		delete process.env.SESSION_SECRET;
		expect(() => loadConfig()).toThrow(/SESSION_SECRET/);
	});

	it("throws when APP_BASE_URL is missing", () => {
		setRequired();
		delete process.env.APP_BASE_URL;
		expect(() => loadConfig()).toThrow(/APP_BASE_URL/);
	});

	it("throws when APP_BASE_URL is invalid", () => {
		setRequired();
		process.env.APP_BASE_URL = "not-a-url";
		expect(() => loadConfig()).toThrow(/APP_BASE_URL/);
	});

	it("throws when SMTP_HOST is missing", () => {
		setRequired();
		delete process.env.SMTP_HOST;
		expect(() => loadConfig()).toThrow(/SMTP_HOST/);
	});

	it("throws when SMTP_FROM is missing", () => {
		setRequired();
		delete process.env.SMTP_FROM;
		expect(() => loadConfig()).toThrow(/SMTP_FROM/);
	});

	it("defaults: PORT=3000, DATA_DIR=/data, SMTP port=587", () => {
		setRequired();
		delete process.env.PORT;
		delete process.env.DATA_DIR;
		delete process.env.SMTP_PORT;
		delete process.env.SMTP_SECURE;
		const cfg = loadConfig();
		expect(cfg.port).toBe(3000);
		expect(cfg.dataDir).toBe("/data");
		expect(cfg.smtp.port).toBe(587);
		expect(cfg.smtp.secure).toBe(false);
		expect(cfg.smtp.user).toBeNull();
	});

	it("SMTP_SECURE=true uses port 465 when SMTP_PORT unset", () => {
		setRequired();
		delete process.env.SMTP_PORT;
		process.env.SMTP_SECURE = "true";
		const cfg = loadConfig();
		expect(cfg.smtp.secure).toBe(true);
		expect(cfg.smtp.port).toBe(465);
	});

	it("SMTP_USER enables SMTP auth credentials", () => {
		setRequired();
		process.env.SMTP_USER = "postmaster";
		process.env.SMTP_PASS = "secret";
		const cfg = loadConfig();
		expect(cfg.smtp.user).toBe("postmaster");
		expect(cfg.smtp.pass).toBe("secret");
	});

	it("defaults fetchProxy to the Jina reader and honors FETCH_PROXY", () => {
		setRequired();
		delete process.env.FETCH_PROXY;
		expect(loadConfig().fetchProxy).toBe("https://r.jina.ai/{url}");
		process.env.FETCH_PROXY = "https://example.com/proxy?url={urlEncoded}";
		expect(loadConfig().fetchProxy).toBe("https://example.com/proxy?url={urlEncoded}");
		process.env.FETCH_PROXY = "";
		expect(loadConfig().fetchProxy).toBe("");
	});
});
