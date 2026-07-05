import { MessageSquareDashed } from "lucide-react";

export function ReviewFeedbackRail() {
	return (
		<aside className="flex w-72 shrink-0 flex-col border-ink/10 border-l bg-panel">
			<header className="shrink-0 border-ink/10 border-b px-4 py-3">
				<h2 className="font-serif text-ink text-sm">feedback</h2>
				<p className="font-mono text-[11px] text-ink-muted">
					revisão linha a linha
				</p>
			</header>

			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
				<MessageSquareDashed
					size={26}
					strokeWidth={1}
					className="text-ink-muted/40"
				/>
				<p className="font-mono text-[12px] text-ink-muted/80">
					feedback chega na próxima versão
				</p>
			</div>

			<div className="shrink-0 border-ink/10 border-t p-3">
				<textarea
					disabled
					rows={3}
					placeholder="comentar uma linha... (em breve)"
					className="w-full cursor-not-allowed resize-none rounded-lg border border-ink/10 bg-paper/40 px-3 py-2 font-mono text-[12px] text-ink-muted/60 placeholder:text-ink-muted/40"
				/>
				<button
					type="button"
					disabled
					className="mt-2 w-full cursor-not-allowed rounded-lg border border-ink/10 bg-paper/40 py-1.5 font-mono text-[11px] text-ink-muted/50"
				>
					enviar
				</button>
			</div>
		</aside>
	);
}
