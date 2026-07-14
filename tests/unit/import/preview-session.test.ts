import { PreviewSessionStore, previewSessions } from "@/import/preview-session";

describe("PreviewSessionStore", () => {
	it("creates and retrieves a session", () => {
		const store = new PreviewSessionStore();
		const id = store.create({
			recipes: [{ title: "X" }],
			detections: [{ status: "new" }],
			filename: "x.json",
		});
		const session = store.get(id);
		expect(session).toBeTruthy();
		expect(session?.recipes.length).toBe(1);
		expect(session?.detections).toEqual([{ status: "new" }]);
		expect(session?.filename).toBe("x.json");
		expect(typeof session?.createdAt).toBe("number");
	});

	it("returns undefined for unknown id", () => {
		const store = new PreviewSessionStore();
		expect(store.get("nonexistent")).toBeUndefined();
	});

	it("deletes a session", () => {
		const store = new PreviewSessionStore();
		const id = store.create({ recipes: [], detections: [], filename: "x" });
		expect(store.get(id)).toBeTruthy();
		store.delete(id);
		expect(store.get(id)).toBeUndefined();
	});

	it("expires sessions after TTL (10 minutes)", () => {
		const store = new PreviewSessionStore();
		const id = store.create({ recipes: [], detections: [], filename: "x" });
		const session = store.get(id);
		expect(session).toBeTruthy();
		expect(store.get(id)).toBeTruthy();
		if (!session) return;
		session.createdAt = Date.now() - 11 * 60 * 1000;
		expect(store.get(id)).toBeUndefined();
		expect(store.size()).toBe(0);
	});

	it("module-level singleton works", () => {
		const id = previewSessions.create({ recipes: [], detections: [], filename: "x" });
		expect(previewSessions.get(id)).toBeTruthy();
		previewSessions.delete(id);
		expect(previewSessions.get(id)).toBeUndefined();
	});
});
