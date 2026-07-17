import { type } from "arktype";

export const fileChange = type({
	path: "string",
	before: "string[]",
	after: "string[]",
});

export type FileChange = typeof fileChange.infer;

export function fileContentLines(content: string): string[] {
	return content === "" ? [] : content.split("\n");
}

export function sameFileContent(left: string[], right: string[]): boolean {
	return left.length === right.length
		&& left.every((line, index) => line === right[index]);
}
