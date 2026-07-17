import { afterEach, describe, expect, it } from "bun:test";
import { fetchHtml } from "@/import/fetcher";

const orig = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = orig;
});

describe("fetchHtml proxy fallback", () => {
	it("returns direct HTML when the direct fetch succeeds", async () => {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const u = String(input);
			expect(u).toBe("https://site.example/recipe");
			return new Response("<html>direct</html>", { status: 200 });
		}) as typeof globalThis.fetch;
		const res = await fetchHtml("https://site.example/recipe", "https://r.jina.ai/{url}");
		expect(res?.html).toContain("direct");
	});

	it("falls back to the proxy when the direct fetch is blocked (402)", async () => {
		const seen: string[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const u = String(input);
			seen.push(u);
			if (u === "https://blocked.example/recipe") {
				return new Response("nope", { status: 402 });
			}
			return new Response("<html>proxied recipe</html>", { status: 200 });
		}) as typeof globalThis.fetch;

		const res = await fetchHtml("https://blocked.example/recipe", "https://r.jina.ai/{url}");
		expect(res?.html).toContain("proxied recipe");
		expect(res?.finalUrl).toBe("https://blocked.example/recipe");
		expect(seen).toContain("https://r.jina.ai/https://blocked.example/recipe");
	});

	it("supports {urlEncoded} proxy templates", async () => {
		const seen: string[] = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const u = String(input);
			seen.push(u);
			if (u === "https://blocked.example/r?a=1") return new Response("x", { status: 403 });
			return new Response("<html>ok</html>", { status: 200 });
		}) as typeof globalThis.fetch;

		await fetchHtml("https://blocked.example/r?a=1", "https://p.example/get?url={urlEncoded}");
		expect(seen).toContain(
			`https://p.example/get?url=${encodeURIComponent("https://blocked.example/r?a=1")}`,
		);
	});

	it("returns null when blocked and no proxy is configured", async () => {
		globalThis.fetch = (async () =>
			new Response("nope", { status: 402 })) as unknown as typeof globalThis.fetch;
		const res = await fetchHtml("https://blocked.example/recipe", "");
		expect(res).toBeNull();
	});
});
