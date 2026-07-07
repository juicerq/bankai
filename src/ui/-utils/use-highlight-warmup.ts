import { useEffect } from "react";
import { Highlight } from "@core/highlight/Highlight";
import type { Turn } from "@core/review/ReviewModel";
import { themeSyntaxStyle } from "@ui/-utils/theme-syntax-style";

export function useHighlightWarmup(turns: Turn[]) {
	useEffect(() => {
		for (const turn of turns) {
			for (const file of turn.files) {
				void Highlight.styledLines(file, themeSyntaxStyle());
			}
		}
	}, [turns]);
}
