interface Bucket {
	tokens: number;
	updatedAt: number;
}

export interface RateLimiterOptions {
	capacity: number;
	refillPerSecond: number;
}

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
}

export class RateLimiter {
	private buckets = new Map<string, Bucket>();
	private capacity: number;
	private refillPerSecond: number;

	constructor(opts: RateLimiterOptions = { capacity: 10, refillPerSecond: 10 }) {
		this.capacity = opts.capacity;
		this.refillPerSecond = opts.refillPerSecond;
	}

	private nowMs(): number {
		return Date.now();
	}

	check(key: string, cost = 1): RateLimitResult {
		const now = this.nowMs();
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = { tokens: this.capacity, updatedAt: now };
			this.buckets.set(key, bucket);
		}
		const elapsed = (now - bucket.updatedAt) / 1000;
		bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerSecond);
		bucket.updatedAt = now;
		if (bucket.tokens >= cost) {
			bucket.tokens -= cost;
			return { allowed: true, retryAfterSeconds: 0 };
		}
		const needed = cost - bucket.tokens;
		const retryAfterSeconds = Math.ceil(needed / this.refillPerSecond);
		return { allowed: false, retryAfterSeconds };
	}

	reset(key: string): void {
		this.buckets.delete(key);
	}

	clear(): void {
		this.buckets.clear();
	}
}

export function clientIp(req: Request): string {
	const xfwd = req.headers.get("X-Forwarded-For");
	if (xfwd) {
		const first = xfwd.split(",")[0]?.trim();
		if (first) return first;
	}
	return "unknown";
}
