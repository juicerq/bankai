import { useEffect, useState } from "react";
import type { TextChunk } from "@opentui/core";
import { Highlight } from "@core/highlight/Highlight";
import type { FileSnapshot } from "@core/review/ReviewModel";
import { themeSyntaxStyle } from "@ui/-utils/theme-syntax-style";

export function useHighlightedFiles(files: FileSnapshot[]): ReadonlyMap<string, TextChunk[][]> {
	const [, setResolvedTick] = useState(0);

	const styled = new Map<string, TextChunk[][]>();
	const pending: FileSnapshot[] = [];

	for (const file of files) {
		const lines = Highlight.peek(file.after);

		if (lines) {
			styled.set(file.path, lines);
		}

		if (lines === undefined) {
			pending.push(file);
		}
	}

	useEffect(() => {
		let alive = true;

		if (pending.length > 0) {
			void Promise.all(pending.map((file) => Highlight.styledLines(file, themeSyntaxStyle()))).then(
				() => {
					if (alive) {
						setResolvedTick((tick) => tick + 1);
					}
				},
			);
		}

		return () => {
			alive = false;
		};
	});

	return styled;
}
