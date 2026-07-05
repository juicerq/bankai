import { useReview } from "../-utils/review-context";

function firstLine(prompt: string): string {
	const line = prompt.split("\n").find((l) => l.trim() !== "");

	return line?.trim() ?? "(sem prompt)";
}

export function ReviewTurnRail() {
	const { turns, selectedIndex, selectTurn } = useReview();
	const turnsLabel = turns.length === 1 ? "turno" : "turnos";

	return (
		<nav className="flex w-64 shrink-0 flex-col border-ink/10 border-r bg-panel">
			<header className="shrink-0 border-ink/10 border-b px-4 py-3">
				<h2 className="font-serif text-ink text-sm">turnos</h2>
				<p className="font-mono text-[11px] text-ink-muted">
					{turns.length} {turnsLabel}
				</p>
			</header>

			<ol className="min-h-0 flex-1 overflow-y-auto py-1">
				{turns.map((turn, index) => {
					const active = index === selectedIndex;
					const fileCount = turn.files.length;
					const filesLabel = fileCount === 1 ? "arquivo" : "arquivos";

					return (
						<li key={turn.turnId}>
							<button
								type="button"
								onClick={() => selectTurn(index)}
								className={`flex w-full flex-col gap-1 border-l-2 px-4 py-2.5 text-left transition-colors ${
									active
										? "border-olive bg-olive/10"
										: "border-transparent hover:bg-ink/[0.04]"
								}`}
							>
								<div className="flex items-baseline justify-between gap-2">
									<span
										className={`font-mono text-[11px] ${active ? "text-olive" : "text-ink-muted"}`}
									>
										#{index + 1}
									</span>
									<span className="font-mono text-[10px] text-ink-muted">
										{fileCount} {filesLabel}
									</span>
								</div>
								<span className="truncate font-mono text-[12px] text-ink">
									{firstLine(turn.prompt)}
								</span>
							</button>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
