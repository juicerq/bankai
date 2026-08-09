import { type } from "arktype";

export const reviewModeSchema = type("'uncommitted' | 'branch' | 'last-turn'");
export type ReviewMode = typeof reviewModeSchema.infer;

const diffLineSchema = type({
	kind: "'context' | 'add' | 'remove'",
	"number?": "number",
	"oldNumber?": "number",
	hunk: "number",
	content: "string",
});
export type DiffLine = typeof diffLineSchema.infer;

export const reviewContentSchema = type({ status: "'ready'", lines: diffLineSchema.array() })
	.or({ status: "'empty'" })
	.or({ status: "'binary'" })
	.or({ status: "'too-large'", "lineCount?": "number" })
	.or({
		status: "'image'",
		mime: "'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'",
		data: "string",
	})
	.or({ status: "'unavailable'" });
export type ReviewContent = typeof reviewContentSchema.infer;

export const reviewFilesSchema = type({
	files: type({ path: "string", content: reviewContentSchema }).array(),
});
export type ReviewFiles = typeof reviewFilesSchema.infer;

export const browsePathsSchema = type("string[]");

const searchMatchSchema = type({ file: "string", line: "number", text: "string" });
export type SearchMatch = typeof searchMatchSchema.infer;

export const searchResultsSchema = type({
	matches: searchMatchSchema.array(),
	truncated: "boolean",
});
export type SearchResults = typeof searchResultsSchema.infer;

const fileStatusSchema = type("'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'");
const fileChangeSchema = type({
	path: "string",
	status: fileStatusSchema,
	additions: "number",
	deletions: "number",
});
export type FileChange = typeof fileChangeSchema.infer;

const worktreeSchema = type({ path: "string", "branch?": "string" });
export const worktreesSchema = worktreeSchema.array();
export type Worktree = typeof worktreeSchema.infer;

export const reviewSnapshotSchema = type({
	state: "'ready' | 'not-a-repo' | 'no-turn'",
	files: fileChangeSchema.array(),
	totals: {
		additions: "number",
		deletions: "number",
		files: "number",
	},
});
export type ReviewSnapshot = typeof reviewSnapshotSchema.infer;
export type FullFile = ReviewContent;

export interface ReviewChangedEvent {
	projectId: string;
	worktree: string;
}

export interface ReviewWatchInput {
	projectId: string;
	worktree?: string;
}

export interface BankaiReviewApi {
	watch: (input: ReviewWatchInput) => Promise<void>;
	unwatch: (input: ReviewWatchInput) => void;
	onChanged: (listener: (event: ReviewChangedEvent) => void) => () => void;
}
