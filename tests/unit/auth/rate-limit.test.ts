import { RateLimiter } from "@/auth/rate-limit";

describe("RateLimiter", () => {
	it("allows up to capacity requests in a burst", () => {
		const rl = new RateLimiter({ capacity: 3, refillPerSecond: 1 });
		expect(rl.check("ip1").allowed).toBe(true);
		expect(rl.check("ip1").allowed).toBe(true);
		expect(rl.check("ip1").allowed).toBe(true);
		expect(rl.check("ip1").allowed).toBe(false);
	});

	it("retryAfterSeconds is reported when limited", () => {
		const rl = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
		rl.check("ip1");
		const result = rl.check("ip1");
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
	});

	it("isolates keys per-IP", () => {
		const rl = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
		expect(rl.check("a").allowed).toBe(true);
		expect(rl.check("b").allowed).toBe(true);
		expect(rl.check("a").allowed).toBe(false);
		expect(rl.check("b").allowed).toBe(false);
	});

	it("refills over time", () => {
		const rl = new RateLimiter({ capacity: 1, refillPerSecond: 1000 });
		rl.check("ip1");
		expect(rl.check("ip1").allowed).toBe(false);
		// Wait 5ms so the bucket refills ~5 tokens at 1000/sec
		const start = Date.now();
		while (Date.now() - start < 10) {
			// busy wait
		}
		expect(rl.check("ip1").allowed).toBe(true);
	});

	it("reset clears a single key but not others", () => {
		const rl = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
		rl.check("a");
		rl.check("b");
		rl.reset("a");
		expect(rl.check("a").allowed).toBe(true);
		expect(rl.check("b").allowed).toBe(false);
	});

	it("clear empties all buckets", () => {
		const rl = new RateLimiter({ capacity: 1, refillPerSecond: 1 });
		rl.check("a");
		rl.check("b");
		rl.clear();
		expect(rl.check("a").allowed).toBe(true);
		expect(rl.check("b").allowed).toBe(true);
	});
});
