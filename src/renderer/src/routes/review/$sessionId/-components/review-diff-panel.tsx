import { FileX } from "lucide-react";
import { filesForMode } from "../-utils/accumulate";
import { useReview } from "../-utils/review-context";
import { ReviewFileDiff } from "./review-file-diff";
import { ReviewModeToggle } from "./review-mode-toggle";

export function ReviewDiffPanel() {
	const { turns, selectedIndex, mode } = useReview();
	const turn = turns[selectedIndex];
	const files = filesForMode(turns, selectedIndex, mode);

	return (
		<div className="flex min-w-0 flex-1 flex-col bg-paper">
			<header className="flex shrink-0 items-center justify-between gap-4 border-ink/10 border-b bg-paper/95 px-4 py-2.5">
				<div className="min-w-0">
					<p className="font-mono text-[11px] text-ink-muted">
						turno #{selectedIndex + 1}
					</p>
					<p className="truncate font-mono text-[12px] text-ink">
						{turn?.prompt.split("\n")[0]?.trim() || "(sem prompt)"}
					</p>
				</div>
				<ReviewModeToggle />
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{files.length === 0 && (
					<div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
						<FileX size={30} strokeWidth={1} className="text-ink-muted/40" />
						<p className="font-mono text-[13px] text-ink-muted">
							nenhum arquivo alterado neste turno
						</p>
						{turn?.prompt.trim() && (
							<p className="max-w-md whitespace-pre-wrap font-mono text-[12px] text-ink-muted/70">
								{turn.prompt.trim()}
							</p>
						)}
					</div>
				)}
				{files.map((file) => (
					<ReviewFileDiff key={file.path} file={file} />
				))}
			</div>
		</div>
	);
}
