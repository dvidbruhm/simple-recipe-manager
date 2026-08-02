import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "src", "ui", "static", "fonts");

const UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const THEME_FONTS: Record<string, string> = {
	aurora: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
	"aurora-solstice":
		"https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
	inkwell:
		"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
	hearth:
		"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"hearth-spice":
		"https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Nunito:wght@400;500;600;700&display=swap",
	"gourmet-noir":
		"https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@400;500;600&display=swap",
};

let slugCounter = 0;
function nextSlug(family: string, weight: string, style: string): string {
	slugCounter++;
	const f = family
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return `${f}-${weight}${style === "italic" ? "-italic" : ""}-${slugCounter}`;
}

async function buildTheme(theme: string, cssUrl: string): Promise<string> {
	const resp = await fetch(cssUrl, { headers: { "User-Agent": UA } });
	if (!resp.ok) throw new Error(`fetch ${theme} css: ${resp.status}`);
	let css = await resp.text();

	const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g;
	let match: RegExpExecArray | null = urlRe.exec(css);
	while (match !== null) {
		const woffUrl = match[1];
		const before = css.slice(0, match.index);
		const famMatch = before.match(/font-family:\s*'([^']+)'/);
		const weightMatch = before.match(/font-weight:\s*(\d+)/);
		const styleMatch = before.match(/font-style:\s*(\w+)/);
		const family = famMatch?.[1] ?? "font";
		const weight = weightMatch?.[1] ?? "400";
		const style = styleMatch?.[1] ?? "normal";
		const slug = nextSlug(family, weight, style);
		const filename = `${slug}.woff2`;

		const woffResp = await fetch(woffUrl);
		if (!woffResp.ok) throw new Error(`fetch woff2 ${theme} ${slug}: ${woffResp.status}`);
		const buf = Buffer.from(await woffResp.arrayBuffer());
		await writeFile(join(OUT_DIR, filename), buf);

		css = css.replace(woffUrl, `/static/fonts/${filename}`);

		match = urlRe.exec(css);
	}
	return css;
}

await mkdir(OUT_DIR, { recursive: true });
for (const [theme, url] of Object.entries(THEME_FONTS)) {
	const css = await buildTheme(theme, url);
	await writeFile(join(OUT_DIR, `${theme}.css`), css, "utf8");
	console.log(`wrote fonts/${theme}.css`);
}
console.log("done");
