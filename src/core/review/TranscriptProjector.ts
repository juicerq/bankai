import type { HarnessTranscript } from "@core/harness/Harness";
import { parsedJson } from "@core/harness/external";
import { Harnesses, sessionKey, type SessionRef } from "@core/harness/registry";
import {
	TranscriptTail,
	type TranscriptFileId,
	type TranscriptTailRead,
} from "@core/harness/transcriptTail";
import { ReviewProjections } from "@core/review/ReviewProjections";
import { ReviewModel, type Turn } from "@core/review/ReviewModel";

type ProjectionRequest =
	| { type: "load"; path?: string }
	| { type: "observe"; alive: boolean };

function recordsFrom(content: string): { records: unknown[]; valid: boolean } {
	const records: unknown[] = [];
	for (const line of content.split("\n")) {
		if (!line) {
			continue;
		}

		const parsed = parsedJson(line);
		if (!parsed.ok) {
			return { records: [], valid: false };
		}

		records.push(parsed.value);
	}
	return { records, valid: true };
}

export class TranscriptProjector {
	private readonly models = new Map<string, ReviewModel>();
	private readonly queues = new Map<string, Promise<void>>();
	private readonly paths = new Map<string, string>();
	private readonly listeners = new Set<(session: SessionRef) => void>();

	onChange(listener: (session: SessionRef) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	async refresh(session: SessionRef, alive: boolean): Promise<void> {
		await this.enqueue(session, { type: "observe", alive });
	}

	async load(session: SessionRef, path?: string): Promise<void> {
		await this.enqueue(session, path ? { type: "load", path } : { type: "load" });
	}

	private async enqueue(session: SessionRef, request: ProjectionRequest): Promise<void> {
		const key = sessionKey(session);
		const previous = this.queues.get(key) ?? Promise.resolve();
		const next = previous.catch(() => {}).then(() => this.refreshNow(session, request));
		this.queues.set(key, next);
		await next;
	}

	private async refreshNow(session: SessionRef, request: ProjectionRequest): Promise<void> {
		const key = sessionKey(session);
		const saved = await ReviewProjections.get(key);
		const transcript = Harnesses.get(session.harness).transcript;
		const observedAlive = request.type === "observe" && request.alive;
		const observedStopped = request.type === "observe" && !request.alive;
		if (saved?.unavailable === "unsafe") {
			return;
		}
		if (!observedAlive && saved?.unavailable === "historical") {
			return;
		}
		if (!observedAlive && saved === undefined && transcript.historicalImport === "observed-only") {
			await ReviewProjections.set(key, {
				offset: 0,
				turns: [],
				unavailable: "historical",
			});
			return;
		}

		const model = this.models.get(key) ?? new ReviewModel(session.sessionId);
		if (!this.models.has(key)) {
			model.restore(saved?.turns ?? []);
			this.models.set(key, model);
		}
		const offset = saved?.offset ?? 0;
		const tail = await this.tailFor(key, session, transcript, request, offset, saved?.fileId);
		if (!tail) {
			if (observedStopped && model.hasOpenWork()) {
				model.interrupt();
				await this.persist(key, offset, model.getTurns(), saved?.fileId);
				this.emit(session);
			}
			return;
		}
		if (tail.state === "replaced") {
			this.paths.delete(key);
			await this.markUnsafe(key, offset, model.getTurns(), saved?.fileId);
			this.emit(session);
			return;
		}

		if (!tail.content && (!model.hasOpenWork() || !observedStopped)) {
			return;
		}
		if (tail.content) {
			const parsed = recordsFrom(tail.content);
			const events = parsed.valid ? await transcript.normalize(parsed.records) : null;
			if (events === null) {
				await this.markUnsafe(key, tail.nextOffset, model.getTurns(), tail.fileId);
				this.emit(session);
				return;
			}
			for (const event of events) {
				model.apply(event);
			}
		}
		if (observedStopped) {
			model.interrupt();
		}
		await this.persist(key, tail.nextOffset, model.getTurns(), tail.fileId);
		this.emit(session);
	}

	async turns(session: SessionRef): Promise<Turn[]> {
		const model = this.models.get(sessionKey(session));
		if (model) {
			return model.getTurns();
		}
		const saved = await ReviewProjections.get(sessionKey(session));
		return saved?.turns ?? [];
	}

	async available(session: SessionRef): Promise<boolean> {
		const saved = await ReviewProjections.get(sessionKey(session));
		return saved?.unavailable === undefined;
	}

	status(session: SessionRef, alive: boolean): "active" | "idle" {
		return alive && this.models.get(sessionKey(session))?.hasOpenWork() ? "active" : "idle";
	}

	private async tailFor(
		key: string,
		session: SessionRef,
		transcript: HarnessTranscript,
		request: ProjectionRequest,
		offset: number,
		fileId?: TranscriptFileId,
	): Promise<TranscriptTailRead | null> {
		const explicit = request.type === "load" ? request.path : undefined;
		const path = explicit ?? this.paths.get(key) ?? await this.locate(session, transcript);
		if (!path) {
			return null;
		}

		this.paths.set(key, path);
		const tail = await TranscriptTail.read(path, offset, fileId).catch(() => null);
		if (tail) {
			return tail;
		}

		this.paths.delete(key);
		if (explicit) {
			return null;
		}

		const relocated = await this.locate(session, transcript);
		if (!relocated) {
			return null;
		}

		this.paths.set(key, relocated);
		return await TranscriptTail.read(relocated, offset, fileId).catch(() => null);
	}

	private async locate(session: SessionRef, transcript: HarnessTranscript): Promise<string | undefined> {
		const located = await transcript.locateMany(new Set([session.sessionId]));
		return located.get(session.sessionId);
	}

	private async persist(
		key: string,
		offset: number,
		turns: Turn[],
		fileId?: TranscriptFileId,
	): Promise<void> {
		const value = fileId ? { offset, turns, fileId } : { offset, turns };
		await ReviewProjections.set(key, value);
	}

	private async markUnsafe(
		key: string,
		offset: number,
		turns: Turn[],
		fileId?: TranscriptFileId,
	): Promise<void> {
		const value = fileId
			? { offset, turns, fileId, unavailable: "unsafe" as const }
			: { offset, turns, unavailable: "unsafe" as const };
		await ReviewProjections.set(key, value);
	}

	private emit(session: SessionRef): void {
		for (const listener of this.listeners) listener(session);
	}
}
