import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { RecipeWithTags } from "./markdown";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const MARGIN_PT = 36;
const MAX_IMAGE_WIDTH_PT = 300;
const MAX_IMAGE_HEIGHT_PT = 340;

function imageMime(filename: string): "jpeg" | "png" | null {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "";
	if (ext === "jpg" || ext === "jpeg") return "jpeg";
	if (ext === "png") return "png";
	return null;
}

export async function renderPdf(recipes: RecipeWithTags[], dataDir: string): Promise<ArrayBuffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({
			size: [A4_WIDTH_PT, A4_HEIGHT_PT],
			margins: { top: MARGIN_PT, bottom: MARGIN_PT, left: MARGIN_PT, right: MARGIN_PT },
			autoFirstPage: false,
		});
		const chunks: Buffer[] = [];
		doc.on("data", (c: Buffer) => chunks.push(c));
		doc.on("end", () => {
			const full = Buffer.concat(chunks);
			const ab = new ArrayBuffer(full.byteLength);
			new Uint8Array(ab).set(full);
			resolve(ab);
		});
		doc.on("error", reject);

		for (let i = 0; i < recipes.length; i++) {
			const r = recipes[i];
			if (!r) continue;
			doc.addPage();

			if (r.image_filename) {
				const imgPath = join(dataDir, "images", r.image_filename);
				if (existsSync(imgPath)) {
					const mime = imageMime(r.image_filename);
					if (mime) {
						try {
							const data = readFileSync(imgPath);
							doc.image(data, (A4_WIDTH_PT - MAX_IMAGE_WIDTH_PT) / 2, MARGIN_PT, {
								width: MAX_IMAGE_WIDTH_PT,
								align: "center",
							});
							doc.moveDown();
							doc.y = MARGIN_PT + MAX_IMAGE_HEIGHT_PT + 12;
						} catch {}
					}
				}
			}

			doc.fontSize(18).font("Helvetica-Bold").text(r.title, { align: "center" });
			doc.moveDown(0.5);

			const stars = "★".repeat(Math.max(0, Math.min(5, r.rating)));
			const meta = [stars, r.source_url ? new URL(r.source_url).hostname.replace(/^www\./, "") : ""]
				.filter(Boolean)
				.join("   |   ");
			if (meta) {
				doc
					.fontSize(10)
					.font("Helvetica-Oblique")
					.fillColor("#666")
					.text(meta, { align: "center" });
				doc.fillColor("#000");
				doc.moveDown();
			}

			if (r.description) {
				doc
					.fontSize(10)
					.font("Helvetica-Oblique")
					.fillColor("#444")
					.text(r.description, { align: "left" });
				doc.fillColor("#000");
				doc.moveDown();
			}

			if (r.ingredients.length > 0) {
				doc.fontSize(13).font("Helvetica-Bold").text("Ingredients");
				doc.moveDown(0.3);
				doc
					.fontSize(10)
					.font("Helvetica")
					.text(r.ingredients.map((ing) => `•  ${ing}`).join("\n"));
				doc.moveDown();
			}

			if (r.steps.length > 0) {
				doc.fontSize(13).font("Helvetica-Bold").text("Steps");
				doc.moveDown(0.3);
				doc
					.fontSize(10)
					.font("Helvetica")
					.text(r.steps.map((s, idx) => `${idx + 1}.  ${s}`).join("\n"));
				doc.moveDown();
			}

			if (r.notes) {
				doc.fontSize(13).font("Helvetica-Bold").text("Notes");
				doc.moveDown(0.3);
				doc.fontSize(10).font("Helvetica").text(r.notes);
				doc.moveDown();
			}

			if (r.tags.length > 0) {
				doc.moveDown();
				doc
					.fontSize(9)
					.font("Helvetica-Oblique")
					.fillColor("#666")
					.text(`Tags: ${r.tags.join(", ")}`);
				doc.fillColor("#000");
			}
		}

		doc.end();
	});
}
