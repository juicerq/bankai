import { Flag, MousePointerClick } from "lucide-react";
import { useReview } from "../-utils/review-context";

export function ReviewFeedbackRail() {
	const { selectedLine, turns, flags, toggleFlag } = useReview();

	const line =
		selectedLine &&
		turns
			.find((t) => t.turnId === selectedLine.turnId)
			?.files.find((f) => f.path === selectedLine.path)
			?.lines.find((l) => l.line === selectedLine.line);

	return (
		<aside className="flex w-72 shrink-0 flex-col border-ink/10 border-l bg-panel">
			<header className="shrink-0 border-ink/10 border-b px-4 py-3">
				<h2 className="font-serif text-ink text-sm">feedback</h2>
				<p className="font-mono text-[11px] text-ink-muted">
					revisão linha a linha
				</p>
			</header>

			{!selectedLine && (
				<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
					<MousePointerClick
						size={26}
						strokeWidth={1}
						className="text-ink-muted/40"
					/>
					<p className="font-mono text-[12px] text-ink-muted/80">
						selecione uma linha do diff para ancorar um comentário
					</p>
				</div>
			)}

			{selectedLine && (
				<>
					<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
						<p className="truncate font-mono text-[11px] text-ink-muted">
							{selectedLine.path}
							<span className="text-olive">:{selectedLine.line}</span>
						</p>
						<pre className="mt-2 overflow-x-auto rounded-lg border border-ink/10 bg-paper/50 px-3 py-2 font-mono text-[12px] text-ink">
							{line?.text ?? ""}
						</pre>

						<button
							type="button"
							onClick={() => toggleFlag(selectedLine)}
							className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-amber focus-visible:outline-none ${
								flags.some(
									(f) =>
										f.turnId === selectedLine.turnId &&
										f.path === selectedLine.path &&
										f.line === selectedLine.line,
								)
									? "border-amber/40 bg-amber/15 text-amber"
									: "border-ink/15 text-ink-muted hover:bg-ink/5 hover:text-ink"
							}`}
						>
							<Flag size={12} strokeWidth={2} />
							flagar esta linha
						</button>
					</div>

					<div className="shrink-0 border-ink/10 border-t p-3">
						<div className="mb-2 flex gap-1.5">
							{["Quality", "Architecture"].map((tag) => (
								<button
									key={tag}
									type="button"
									disabled
									className="cursor-not-allowed rounded-full border border-ink/10 bg-paper/40 px-2.5 py-0.5 font-mono text-[10px] text-ink-muted/50"
								>
									{tag}
								</button>
							))}
						</div>
						<textarea
							disabled
							rows={3}
							placeholder="comentar esta linha... (em breve)"
							className="w-full cursor-not-allowed resize-none rounded-lg border border-ink/10 bg-paper/40 px-3 py-2 font-mono text-[12px] text-ink-muted/60 placeholder:text-ink-muted/40"
						/>
						<button
							type="button"
							disabled
							className="mt-2 w-full cursor-not-allowed rounded-lg border border-ink/10 bg-paper/40 py-1.5 font-mono text-[11px] text-ink-muted/50"
						>
							enviar ao terminal (próxima versão)
						</button>
					</div>
				</>
			)}
		</aside>
	);
}
