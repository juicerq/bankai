import { Check, FileX, Flag, TriangleAlert } from "lucide-react";
import { filesForMode } from "../-utils/accumulate";
import { useReview } from "../-utils/review-context";
import { ReviewFileDiff } from "./review-file-diff";
import { ReviewModeToggle } from "./review-mode-toggle";

export function ReviewDiffPanel() {
	const {
		turns,
		selectedIndex,
		mode,
		reviewed,
		toggleReviewed,
		flags,
		toggleFlag,
		cascade,
	} = useReview();
	const turn = turns[selectedIndex];
	const isReviewed = turn ? reviewed.has(turn.turnId) : false;
	const isFlagged = turn
		? flags.some((f) => f.turnId === turn.turnId && f.path === undefined)
		: false;
	const reviewLabel = isReviewed ? "revisado" : "marcar revisado";
	const flagLabel = isFlagged ? "flagado" : "flag";
	const files = filesForMode(turns, selectedIndex, mode);
	const sources = turn ? cascade.get(turn.turnId) : undefined;
	const cascadeText =
		sources && sources.length > 0
			? `constrói sobre ${sources.length === 1 ? "o turno" : "os turnos"} ${sources
					.map((i) => `#${i + 1}`)
					.join(", ")} ${sources.length === 1 ? "flagado" : "flagados"} - a correção deve propagar até aqui`
			: null;

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
				<div className="flex shrink-0 items-center gap-2">
					{turn && (
						<button
							type="button"
							onClick={() => toggleFlag({ turnId: turn.turnId })}
							className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none ${
								isFlagged
									? "border-amber/40 bg-amber/15 text-amber"
									: "border-ink/15 text-ink-muted hover:bg-ink/5 hover:text-ink"
							}`}
						>
							<Flag size={13} strokeWidth={2} />
							{flagLabel}
						</button>
					)}
					{turn && (
						<button
							type="button"
							onClick={() => toggleReviewed(turn.turnId)}
							className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-olive focus-visible:outline-none ${
								isReviewed
									? "border-olive/30 bg-olive/15 text-olive"
									: "border-ink/15 text-ink-muted hover:bg-ink/5 hover:text-ink"
							}`}
						>
							<Check size={13} strokeWidth={2} />
							{reviewLabel}
						</button>
					)}
					<ReviewModeToggle />
				</div>
			</header>

			{cascadeText && (
				<div className="flex items-center gap-2 border-amber/20 border-b bg-amber/10 px-4 py-2 font-mono text-[11px] text-amber">
					<TriangleAlert size={13} strokeWidth={2} className="shrink-0" />
					<span>{cascadeText}</span>
				</div>
			)}

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
