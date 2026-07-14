import { randomUUID } from "node:crypto";
import type { DetectionResult } from "./duplicate-detector";
import type { PartialRecipe } from "./extractor";

export interface ParsedImport {
	recipes: PartialRecipe[];
	detections: DetectionResult[];
	createdAt: number;
	filename: string;
}

const TTL_MS = 10 * 60 * 1000;

export class PreviewSessionStore {
	private sessions = new Map<string, ParsedImport>();
	private lastSweep = Date.now();

	create(data: Omit<ParsedImport, "createdAt">): string {
		const id = randomUUID();
		this.sessions.set(id, { ...data, createdAt: Date.now() });
		this.maybeSweep();
		return id;
	}

	get(id: string): ParsedImport | undefined {
		const session = this.sessions.get(id);
		if (!session) return undefined;
		if (Date.now() - session.createdAt > TTL_MS) {
			this.sessions.delete(id);
			return undefined;
		}
		return session;
	}

	delete(id: string): void {
		this.sessions.delete(id);
	}

	size(): number {
		return this.sessions.size;
	}

	private maybeSweep(): void {
		const now = Date.now();
		if (now - this.lastSweep < 60_000) return;
		this.lastSweep = now;
		for (const [id, session] of this.sessions) {
			if (now - session.createdAt > TTL_MS) {
				this.sessions.delete(id);
			}
		}
	}
}

export const previewSessions = new PreviewSessionStore();
