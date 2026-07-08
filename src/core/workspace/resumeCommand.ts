import { basename } from "node:path";
import type { WorkspaceCommand } from "@core/store/workspace";

const INTERNAL_MARKERS = new Set(["--bg-pty-host", "--bg-spare", "daemon", "--fork-session", "bg-pty-host", "bg-spare"]);

function hasInternalMarker(argv: string[]): boolean {
	for (const token of argv) {
		if (INTERNAL_MARKERS.has(token) || token.startsWith("--bg-") || token.includes(".sock")) {
			return true;
		}
	}

	const resumeIndex = argv.indexOf("--resume");
	return resumeIndex >= 0 && argv[resumeIndex + 1]?.endsWith(".jsonl") === true;
}

function isReplayable(argv: string[], kind: string | undefined): boolean {
	if (kind !== undefined && kind !== "interactive") {
		return false;
	}

	const first = argv[0];
	if (first === undefined || basename(first) !== "claude") {
		return false;
	}

	return !hasInternalMarker(argv);
}

function stripResumeFlags(argv: string[]): string[] {
	const out: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === undefined || token === "--continue" || token.startsWith("--continue=")) {
			continue;
		}

		if (token === "--resume" || token === "--session-id") {
			i++;
			continue;
		}

		if (token.startsWith("--resume=") || token.startsWith("--session-id=")) {
			continue;
		}

		out.push(token);
	}

	return out;
}

export function buildResumeCommand({ argv, kind, sessionId }: WorkspaceCommand): string {
	if (argv === undefined || !isReplayable(argv, kind)) {
		return `claude --resume ${sessionId}`;
	}

	return [...stripResumeFlags(argv), "--resume", sessionId].join(" ");
}

export function buildFreshCommand({ argv, kind }: WorkspaceCommand): string {
	if (argv === undefined || !isReplayable(argv, kind)) {
		return "claude";
	}

	return stripResumeFlags(argv).join(" ");
}
