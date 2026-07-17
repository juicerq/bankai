import { readFile } from "node:fs/promises";
import { type } from "arktype";
import type { TranscriptEvent } from "@core/harness/Harness";
import { codexEvent } from "@core/harness/codex/records";
import { accepted } from "@core/harness/external";

const eventKind = type({ type: "string" });
const patchApply = type({
	type: type.enumerated("patch_apply_end"),
	success: "true",
	changes: { "[string]": "unknown" },
});
const patchChange = type({
	type: type.enumerated("create", "update", "delete"),
	unified_diff: "string",
	"move_path?": "string | null",
});

type PatchHunk = {
	oldCount: number;
	newStart: number;
	newCount: number;
	before: string[];
	after: string[];
};
type PatchRecord = {
	record: unknown;
	path: string;
	changeType: "create" | "update" | "delete";
	hunks: PatchHunk[];
};

function samePatchLines(left: string[], right: string[]): boolean {
	return left.length === right.length
		&& left.every((line, index) => line === right[index]);
}

function patchHunks(diff: string): PatchHunk[] | null {
	const hunks: PatchHunk[] = [];
	let current: PatchHunk | null = null;

	for (const line of diff.split("\n")) {
		const header = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (header) {
			current = {
				oldCount: Number(header[1] ?? "1"),
				newStart: Number(header[2]),
				newCount: Number(header[3] ?? "1"),
				before: [],
				after: [],
			};
			hunks.push(current);
		} else if (current && line.startsWith("-")) {
			current.before.push(line.slice(1));
		} else if (current && line.startsWith("+")) {
			current.after.push(line.slice(1));
		} else if (current && line.startsWith(" ")) {
			current.before.push(line.slice(1));
			current.after.push(line.slice(1));
		}
	}

	return hunks.length > 0
		&& hunks.every((hunk) =>
			hunk.before.length === hunk.oldCount && hunk.after.length === hunk.newCount)
		? hunks
		: null;
}

function reversePatch(after: string, hunks: PatchHunk[]): string | null {
	const lines = after ? after.split("\n") : [];
	for (const hunk of hunks.toReversed()) {
		const index = Math.max(0, hunk.newStart - 1);
		if (!samePatchLines(lines.slice(index, index + hunk.newCount), hunk.after)) {
			return null;
		}
		lines.splice(index, hunk.newCount, ...hunk.before);
	}

	return lines.join("\n");
}

function recordsFrom(records: unknown[]): PatchRecord[] | null {
	const patches: PatchRecord[] = [];

	for (const record of records) {
		const event = codexEvent(record);
		const kind = event ? accepted(eventKind, event.payload) : null;
		if (kind?.type !== "patch_apply_end") {
			continue;
		}

		const patch = accepted(patchApply, event?.payload);
		if (!patch) {
			return null;
		}

		for (const [path, raw] of Object.entries(patch.changes)) {
			const change = accepted(patchChange, raw);
			if (!change || change.move_path) {
				return null;
			}

			const hunks = patchHunks(change.unified_diff);
			if (!hunks) {
				return null;
			}
			patches.push({ record, path, changeType: change.type, hunks });
		}
	}

	return patches;
}

export async function codexPatchEvents(
	records: unknown[],
): Promise<Map<unknown, TranscriptEvent[]> | null> {
	const patches = recordsFrom(records);
	if (!patches) {
		return null;
	}

	const byPath = new Map<string, PatchRecord[]>();
	for (const patch of patches) {
		const related = byPath.get(patch.path) ?? [];
		related.push(patch);
		byPath.set(patch.path, related);
	}

	const snapshots = new Map<PatchRecord, { before: string; after: string }>();
	const materialized = await Promise.all([...byPath].map(async ([path, related]) => {
		const last = related.at(-1)!;
		let after = await readFile(path, "utf8")
			.catch(() => last.changeType === "delete" ? "" : null);
		if (after === null) {
			return null;
		}

		const pathSnapshots: [PatchRecord, { before: string; after: string }][] = [];
		for (const patch of related.toReversed()) {
			const before = reversePatch(after, patch.hunks);
			if (before === null) {
				return null;
			}
			pathSnapshots.push([patch, { before, after }]);
			after = before;
		}
		return pathSnapshots;
	}));
	for (const pathSnapshots of materialized) {
		if (!pathSnapshots) {
			return null;
		}
		for (const [patch, snapshot] of pathSnapshots) {
			snapshots.set(patch, snapshot);
		}
	}

	const events = new Map<unknown, TranscriptEvent[]>();
	for (const patch of patches) {
		const snapshot = snapshots.get(patch);
		if (!snapshot) {
			return null;
		}

		const related = events.get(patch.record) ?? [];
		related.push({ type: "change", path: patch.path, ...snapshot });
		events.set(patch.record, related);
	}

	return events;
}
