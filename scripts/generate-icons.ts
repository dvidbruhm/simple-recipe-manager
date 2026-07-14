import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("src/ui/static/icons", { recursive: true });

const COLOR = { r: 0x5a, g: 0x7a, b: 0x4f, alpha: 255 };

for (const size of [192, 512]) {
	await sharp({
		create: { width: size, height: size, channels: 4, background: COLOR },
	})
		.png()
		.toFile(`src/ui/static/icons/${size}.png`);
}

await sharp({
	create: { width: 512, height: 512, channels: 4, background: COLOR },
})
	.png()
	.toFile("src/ui/static/icons/512-maskable.png");

console.log("icons generated");