const MAX_DENOM = 16;
const TOLERANCE = 0.02;

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/**
 * Convert a decimal like 0.25 or 1.5 into a fraction string ("1/4", "1 1/2").
 * Returns null when the value has no close small-denominator fraction.
 */
function decimalToFraction(value: number): string | null {
	if (!Number.isFinite(value)) return null;
	const sign = value < 0 ? "-" : "";
	const abs = Math.abs(value);
	const whole = Math.floor(abs);
	const frac = abs - whole;

	if (frac < TOLERANCE) return `${sign}${whole}`;
	if (1 - frac < TOLERANCE) return `${sign}${whole + 1}`;

	let best: { num: number; den: number; err: number } | null = null;
	for (let den = 2; den <= MAX_DENOM; den++) {
		const num = Math.round(frac * den);
		if (num === 0 || num >= den) continue;
		const err = Math.abs(frac - num / den);
		if (!best || err < best.err) best = { num, den, err };
	}
	if (!best || best.err > TOLERANCE) return null;

	const g = gcd(best.num, best.den);
	const num = best.num / g;
	const den = best.den / g;
	const fracStr = `${num}/${den}`;
	return whole > 0 ? `${sign}${whole} ${fracStr}` : `${sign}${fracStr}`;
}

/**
 * Rewrite decimal quantities in an ingredient line as fractions.
 * e.g. "0.25 cup sugar" -> "1/4 cup sugar", "1.5 tsp salt" -> "1 1/2 tsp salt".
 */
export function toFractions(text: string): string {
	if (!text) return text;
	return text.replace(/(?<![\d.,])\d*\.\d+/g, (match) => {
		const value = Number(match);
		const frac = decimalToFraction(value);
		return frac ?? match;
	});
}
