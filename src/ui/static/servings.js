(function () {
  const ALLOWED_DENOMS = [2, 3, 4, 6, 8, 16];
  const TOLERANCE = 0.02;
  const VULGAR = {
    "½": 1 / 2, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 1 / 4, "¾": 3 / 4,
    "⅕": 1 / 5, "⅖": 2 / 5, "⅗": 3 / 5, "⅘": 4 / 5,
    "⅙": 1 / 6, "⅚": 5 / 6,
    "⅛": 1 / 8, "⅜": 3 / 8, "⅝": 5 / 8, "⅞": 7 / 8,
  };
  const FRACTION_RE = /^(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:-(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?))?/;

  function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

  function parseMixed(token) {
    const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const den = Number(mixed[3]);
      if (den === 0) return null;
      return Number(mixed[1]) + Number(mixed[2]) / den;
    }
    const frac = token.match(/^(\d+)\/(\d+)$/);
    if (frac) {
      const den = Number(frac[2]);
      if (den === 0) return null;
      return Number(frac[1]) / den;
    }
    const dec = token.match(/^(\d+(?:\.\d+)?)$/);
    if (dec) return Number(dec[1]);
    return null;
  }

  function parseLeading(line) {
    const trimmed = line.trimStart();
    if (!trimmed) return null;
    const v = trimmed[0];
    if (v && Object.prototype.hasOwnProperty.call(VULGAR, v)) {
      return { value: VULGAR[v], end: 1 };
    }
    const startSpaces = line.length - trimmed.length;
    const match = trimmed.match(FRACTION_RE);
    if (!match) return null;
    const text = match[0];
    const dashIdx = text.indexOf("-");
    if (dashIdx > 0) {
      const lo = parseMixed(text.slice(0, dashIdx));
      if (lo === null) return null;
      return { value: lo, end: startSpaces + text.length };
    }
    const value = parseMixed(text);
    if (value === null) return null;
    return { value, end: startSpaces + text.length };
  }

  function formatQuantity(value) {
    if (!Number.isFinite(value)) return String(value);
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const whole = Math.floor(abs);
    const frac = abs - whole;
    if (frac < TOLERANCE) return `${sign}${whole}`;
    if (1 - frac < TOLERANCE) return `${sign}${whole + 1}`;
    let best = null;
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

  function scaleLine(line, factor) {
    if (factor === 1) return line;
    const parsed = parseLeading(line);
    if (!parsed) return line;
    return formatQuantity(parsed.value * factor) + line.slice(parsed.end);
  }

  function initAll() {
    document.querySelectorAll("[data-ingredients]").forEach((section) => {
      const input = section.querySelector("[data-base-servings]");
      if (!input) return;
      const base = Number(input.getAttribute("data-base-servings"));
      if (!Number.isFinite(base) || base <= 0) return;
      const incBtn = section.querySelector("[data-servings-inc]");
      const decBtn = section.querySelector("[data-servings-dec]");
      const resetBtn = section.querySelector("[data-servings-reset]");
      const spans = Array.from(section.querySelectorAll("[data-original]"));

      function apply() {
        const current = Number(input.value);
        if (!Number.isFinite(current) || current <= 0) {
          spans.forEach((s) => {
            s.textContent = s.getAttribute("data-original") || "";
          });
          if (resetBtn) resetBtn.classList.toggle("hidden", true);
          return;
        }
        const factor = current / base;
        spans.forEach((s) => {
          const original = s.getAttribute("data-original") || "";
          s.textContent = scaleLine(original, factor);
        });
        if (resetBtn) resetBtn.classList.toggle("hidden", current === base);
      }

      input.addEventListener("input", apply);
      if (incBtn) incBtn.addEventListener("click", () => {
        const v = Number(input.value) || 0;
        input.value = String(Math.max(1, v + 1));
        apply();
      });
      if (decBtn) decBtn.addEventListener("click", () => {
        const v = Number(input.value) || 0;
        input.value = String(Math.max(1, v - 1));
        apply();
      });
      if (resetBtn) resetBtn.addEventListener("click", () => {
        input.value = String(base);
        apply();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
