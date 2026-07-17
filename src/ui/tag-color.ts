const PALETTE = [
	"#d4644f",
	"#e08a3c",
	"#c9a227",
	"#6fae4f",
	"#3ca374",
	"#3c9aa3",
	"#3c7fae",
	"#5a6fd4",
	"#8a5fc4",
	"#c45fa8",
	"#a86b4f",
	"#6b7a8a",
];

export function tagColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) | 0;
	}
	const idx = Math.abs(hash) % PALETTE.length;
	return PALETTE[idx] ?? PALETTE[0] ?? "#5a7a4f";
}
