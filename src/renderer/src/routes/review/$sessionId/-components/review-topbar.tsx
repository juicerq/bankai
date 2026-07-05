import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export function ReviewTopbar(props: { cwd: string }) {
	return (
		<header className="flex shrink-0 items-center gap-4 border-ink/10 border-b bg-panel px-4 py-2.5">
			<Link
				to="/"
				className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-2.5 py-1 font-mono text-[12px] text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
			>
				<ArrowLeft size={14} strokeWidth={1.75} />
				voltar ao canvas
			</Link>

			<div className="min-w-0">
				<p className="truncate font-mono text-[12px] text-ink">{props.cwd}</p>
			</div>
		</header>
	);
}
