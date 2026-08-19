import { type } from "arktype";

export const SESSION_AUTO_ARCHIVE_MS = 3 * 24 * 60 * 60 * 1000;

export const continuitySessionRefSchema = type({ harness: "string", sessionId: "string", cwd: "string" });

export const continuityShellSchema = type({
	id: "string",
	label: "string",
	createdAt: "number",
	"session?": continuitySessionRefSchema,
	"lastTouchedAt?": "number",
	"branch?": "string",
	"title?": "string",
	"titleSource?": "'user' | 'harness'",
	"archivedAt?": "number",
	"pinnedAt?": "number",
	"doneAt?": "number",
	"plain?": "boolean",
	"launch?": "string",
});

const continuityWorkspaceSchema = type({
	projectId: "string",
	shells: continuityShellSchema.array(),
});

export const continuitySchema = type({
	"selectedShellId?": "string",
	workspaces: continuityWorkspaceSchema.array(),
});

export type ContinuitySessionRef = typeof continuitySessionRefSchema.infer;
export type ContinuityShell = typeof continuityShellSchema.infer;
export type ContinuityWorkspace = typeof continuityWorkspaceSchema.infer;
export type ContinuityValue = typeof continuitySchema.infer;

export interface ContinuityChangedEvent {
	value: ContinuityValue;
}

export interface BankaiContinuityApi {
	subscribe: () => void;
	onChanged: (listener: (event: ContinuityChangedEvent) => void) => () => void;
}

export function shellTitle(shell: Pick<ContinuityShell, "label" | "title" | "branch">): string {
	return [shell.title, shell.branch].find((value) => !!value?.trim()) ?? shell.label;
}
