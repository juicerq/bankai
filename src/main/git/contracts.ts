import { type } from "arktype";

export const reviewModeSchema = type("'uncommitted' | 'branch'");
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
	.or({ status: "'unavailable'" });
export type ReviewContent = typeof reviewContentSchema.infer;

const fileStatusSchema = type("'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'");
const fileChangeSchema = type({
	path: "string",
	status: fileStatusSchema,
	additions: "number",
	deletions: "number",
});
export type FileChange = typeof fileChangeSchema.infer;

export const reviewSnapshotSchema = type({
	isRepo: "boolean",
	files: fileChangeSchema.array(),
	totals: {
		additions: "number",
		deletions: "number",
		files: "number",
	},
});
export type ReviewSnapshot = typeof reviewSnapshotSchema.infer;
export type FullFile = ReviewContent;
