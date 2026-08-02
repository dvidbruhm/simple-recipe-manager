export interface ParsedQuantity {
	value: number;
	text: string;
	end: number;
}

const FRACTION_RE =
	/^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:-(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?/;
const VULGAR: Record<string, number> = {
	"½": 1 / 2,
	"⅓": 1 / 3,
	"⅔": 2 / 3,
	"¼": 1 / 4,
	"¾": 3 / 4,
	"⅕": 1 / 5,
	"⅖": 2 / 5,
	"⅗": 3 / 5,
	"⅘": 4 / 5,
	"⅙": 1 / 6,
	"⅚": 5 / 6,
	"⅛": 1 / 8,
	"⅜": 3 / 8,
	"⅝": 5 / 8,
	"⅞": 7 / 8,
};
const ALLOWED_DENOMS = [2, 3, 4, 6, 8, 16];
const TOLERANCE = 0.02;

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

function parseMixedOrFraction(token: string): number | null {
	const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) {
		const [, w, n, d] = mixed;
		const num = Number(n);
		const den = Number(d);
		if (den === 0) return null;
		return Number(w) + num / den;
	}
	const frac = token.match(/^(\d+)\/(\d+)$/);
	if (frac) {
		const [, n, d] = frac;
		const num = Number(n);
		const den = Number(d);
		if (den === 0) return null;
		return num / den;
	}
	const dec = token.match(/^(\d+(?:\.\d+)?)$/);
	if (dec) {
		return Number(dec[1]);
	}
	return null;
}

/**
 * Parse the leading quantity from an ingredient line.
 * Returns null when no leading numeric quantity is found.
 * Supports: "1 cup", "1.5 cup", "1/2 cup", "1 1/2 cup", "½ cup", "1-2 cups" (uses lower bound).
 */
export function parseLeadingQuantity(line: string): ParsedQuantity | null {
	const trimmed = line.trimStart();
	if (!trimmed) return null;

	const vulgarChar = trimmed[0];
	if (vulgarChar && Object.hasOwn(VULGAR, vulgarChar)) {
		return { value: VULGAR[vulgarChar] ?? 0, text: vulgarChar, end: 1 };
	}

	const startSpaces = line.length - trimmed.length;
	const match = trimmed.match(FRACTION_RE);
	if (!match) return null;
	const text = match[0];

	const dashIdx = text.indexOf("-");
	if (dashIdx > 0) {
		const lo = parseMixedOrFraction(text.slice(0, dashIdx));
		if (lo === null) return null;
		return {
			value: lo,
			text,
			end: startSpaces + text.length,
		};
	}

	const value = parseMixedOrFraction(text);
	if (value === null) return null;
	return { value, text, end: startSpaces + text.length };
}

export function formatQuantity(value: number): string {
	if (!Number.isFinite(value)) return String(value);
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	const whole = Math.floor(abs);
	const frac = abs - whole;

	if (frac < TOLERANCE) return `${sign}${whole}`;
	if (1 - frac < TOLERANCE) return `${sign}${whole + 1}`;

	let best: { num: number; den: number; err: number } | null = null;
	for (const den of ALLOWED_DENOMS) {
		const num = Math.round(frac * den);
		if (num === 0 || num >= den) continue;
		const err = Math.abs(frac - num / den);
		if (!best || err < best.err) best = { num, den, err };
	}
	if (!best || best.err > TOLERANCE) {
		const rounded = Math.round(abs * 100) / 100;
		return `${sign}${rounded}`;
	}
	const g = gcd(best.num, best.den);
	const num = best.num / g;
	const den = best.den / g;
	const fracStr = `${num}/${den}`;
	return whole > 0 ? `${sign}${whole} ${fracStr}` : `${sign}${fracStr}`;
}

/**
 * Scale the leading quantity in an ingredient line by the given factor.
 * Leaves the rest of the line untouched. Returns the original line when no
 * leading quantity is found or the factor is 1.
 */
export function scaleIngredientLine(line: string, factor: number): string {
	if (factor === 1) return line;
	const parsed = parseLeadingQuantity(line);
	if (!parsed) return line;
	const scaled = parsed.value * factor;
	const formatted = formatQuantity(scaled);
	return line.slice(0, 0) + formatted + line.slice(parsed.end);
}
