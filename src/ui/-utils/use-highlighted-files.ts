import { useSyncExternalStore } from "react";
import type { TextChunk } from "@opentui/core";
import { Highlighter } from "@core/highlight/Highlight";
import type { FileChange } from "@core/review/FileChange";
import { themeSyntaxStyle } from "@ui/-utils/theme-syntax-style";
import { useHeldWhileLoading } from "@ui/-utils/use-held-while-loading";

export function useHighlightedFiles(files: FileChange[]): {
	shown: FileChange[];
	styled: ReadonlyMap<FileChange, TextChunk[][]>;
} {
	const style = themeSyntaxStyle();

	useSyncExternalStore(Highlighter.subscribe, Highlighter.version);
	Highlighter.ensure(files, style);

	const highlighting = files.some((file) => Highlighter.peek(file, style) === undefined);
	const shown = useHeldWhileLoading(files, highlighting);
	const styled = new Map<FileChange, TextChunk[][]>();

	for (const file of shown) {
		const lines = Highlighter.peek(file, style);

		if (lines) {
			styled.set(file, lines);
		}
	}

	return { shown, styled };
}
