import { useEffect, useState } from "react";
import type { TextChunk } from "@opentui/core";
import { Highlighter } from "@core/highlight/Highlight";
import { Logger } from "@core/logger";
import type { FileChange } from "@core/review/FileChange";
import { themeSyntaxStyle } from "@ui/-utils/theme-syntax-style";

export function useHighlightedFiles(files: FileChange[]): ReadonlyMap<FileChange, TextChunk[][]> {
	const [, setResolvedTick] = useState(0);
	const style = themeSyntaxStyle();

	const styled = new Map<FileChange, TextChunk[][]>();
	const unresolved: FileChange[] = [];

	for (const file of files) {
		const lines = Highlighter.peek(file, style);

		if (lines) {
			styled.set(file, lines);
		}

		if (lines === undefined) {
			unresolved.push(file);
		}
	}

	useEffect(() => {
		let alive = true;

		if (unresolved.length > 0) {
			void Promise.all(unresolved.map((file) => Highlighter.lines(file, style))).then(
				() => {
					if (alive) {
						setResolvedTick((tick) => tick + 1);
					}
				},
			).catch((err) => Logger.warn("highlight:failed", String(err)));
		}

		return () => {
			alive = false;
		};
	});

	return styled;
}
