import type { FileDiff } from "@main/review/ReviewModel";
import { languageFor } from "../-utils/highlight";
import { ReviewDiffLine } from "./review-diff-line";

export function ReviewFileDiff({ file }: { file: FileDiff }) {
	const language = languageFor(file.path);
	const lineLabel = file.lines.length === 1 ? "linha" : "linhas";

	return (
		<section className="border-ink/5 border-b">
			<header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-ink/10 border-b bg-panel/95 px-4 py-2 backdrop-blur-sm">
				<span className="truncate font-mono text-[12px] text-ink">
					{file.path}
				</span>
				<span className="shrink-0 font-mono text-[11px] text-ink-muted">
					{file.lines.length} {lineLabel}
				</span>
			</header>

			<div className="py-1">
				{file.lines.map((line) => (
					<ReviewDiffLine
						key={`${line.turnId}:${line.line}`}
						line={line}
						language={language}
					/>
				))}
			</div>
		</section>
	);
}
