import { useEffect } from "react";
import { filesForMode } from "@core/review/accumulate";
import { warmDiff } from "@core/review/diff";
import type { Turn } from "@core/review/ReviewModel";

export function useDiffWarmup(turns: Turn[]) {
	useEffect(() => {
		const files = filesForMode(turns, 0, "accumulated");
		const timers = files.map((file) => setTimeout(() => warmDiff(file.before, file.after), 0));

		return () => {
			for (const timer of timers) {
				clearTimeout(timer);
			}
		};
	}, [turns]);
}
