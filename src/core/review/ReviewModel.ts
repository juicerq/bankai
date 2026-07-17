import { type } from "arktype";
import type { TranscriptEvent } from "@core/harness/Harness";
import {
	fileChange,
	fileContentLines,
	sameFileContent,
} from "@core/review/FileChange";

export const reviewTurn = type({
	turnId: "string",
	prompt: "string",
	files: fileChange.array(),
	state: type.enumerated("active", "completed", "interrupted"),
});

export type Turn = typeof reviewTurn.infer;

export type SessionStatus = "active" | "idle";

export class ReviewModel {
	private turns: Turn[] = [];
	private open: Turn | null = null;

	constructor(private readonly sessionId: string) {}

	apply(event: TranscriptEvent): void {
		if (event.type === "prompt") {
			this.closeOpen("interrupted");
			this.open = this.newTurn(event.prompt);
			return;
		}
		if (event.type === "complete") {
			this.closeOpen("completed");
			return;
		}

		const turn = this.open ?? (this.open = this.newTurn(""));
		const before = fileContentLines(event.before);
		const after = fileContentLines(event.after);
		const existing = turn.files.find((file) => file.path === event.path);

		if (existing && sameFileContent(existing.after, before)) {
			existing.after = after;
			return;
		}

		turn.files.push({ path: event.path, before, after });
	}

	interrupt(): void {
		this.closeOpen("interrupted");
	}

	restore(turns: Turn[]): void {
		const last = turns.at(-1);
		this.open = last?.state === "active" ? last : null;
		this.turns = this.open ? turns.slice(0, -1) : turns;
	}

	getTurns(): Turn[] {
		return this.open?.files.length ? [...this.turns, this.open] : this.turns;
	}

	hasOpenWork(): boolean {
		return !!this.open?.files.length;
	}

	private newTurn(prompt: string): Turn {
		return {
			turnId: `${this.sessionId}:${this.turns.length}`,
			prompt,
			files: [],
			state: "active",
		};
	}

	private closeOpen(completion: "completed" | "interrupted"): void {
		if (this.open?.files.length) {
			this.open.state = completion;
			this.turns.push(this.open);
		}
		this.open = null;
	}
}
