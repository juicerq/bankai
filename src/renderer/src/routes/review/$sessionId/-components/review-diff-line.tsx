import { Flag } from "lucide-react";
import type { DiffLine } from "@main/review/ReviewModel";
import { highlightLine } from "../-utils/highlight";
import { useReview } from "../-utils/review-context";

const CODE_CLASS =
	"hljs min-h-[1.2em] min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-4 font-mono text-[12.5px] leading-[1.55]";

export function ReviewDiffLine(props: {
	line: DiffLine;
	language: string | undefined;
}) {
	const { line, language } = props;
	const { selectedLine, selectLine, flags } = useReview();
	const html = highlightLine(line.text, language);
	const isContext = line.kind === "context";
	const codeClass = `${CODE_CLASS} ${isContext ? "text-ink-muted opacity-80" : "text-ink"}`;

	const selected =
		selectedLine?.turnId === line.turnId &&
		selectedLine.path === line.path &&
		selectedLine.line === line.line;
	const flagged = flags.some(
		(f) =>
			f.turnId === line.turnId && f.path === line.path && f.line === line.line,
	);

	const tone = selected
		? "bg-olive/20"
		: flagged
			? "bg-amber/[0.12] hover:bg-amber/20"
			: isContext
				? "hover:bg-ink/[0.04]"
				: "bg-olive/[0.05] hover:bg-olive/[0.09]";

	return (
		<button
			type="button"
			data-turn-id={line.turnId}
			data-path={line.path}
			data-line={line.line}
			onClick={() =>
				selectLine({ turnId: line.turnId, path: line.path, line: line.line })
			}
			className={`flex w-full items-start gap-0 text-left transition-colors focus-visible:outline-none ${tone}`}
		>
			<span className="w-11 shrink-0 select-none py-0.5 pr-3 text-right font-mono text-[11px] text-ink-muted/50 tabular-nums">
				{line.line}
			</span>
			<span
				className={`flex w-4 shrink-0 select-none justify-center py-0.5 text-center font-mono text-[12px] ${flagged ? "text-amber" : "text-olive/70"}`}
			>
				{flagged && <Flag size={10} strokeWidth={2.25} className="mt-1" />}
				{!flagged && !isContext && "+"}
			</span>
			{html === null && <code className={codeClass}>{line.text}</code>}
			{html !== null && (
				<code
					className={codeClass}
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			)}
		</button>
	);
}
