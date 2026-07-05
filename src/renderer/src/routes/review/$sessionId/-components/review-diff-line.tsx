import type { DiffLine } from "@main/review/ReviewModel";
import { highlightLine } from "../-utils/highlight";

const CODE_CLASS =
	"hljs min-h-[1.2em] min-w-0 flex-1 whitespace-pre-wrap break-words py-0.5 pr-4 font-mono text-[12.5px] leading-[1.55] text-ink";

export function ReviewDiffLine(props: {
	line: DiffLine;
	language: string | undefined;
}) {
	const { line, language } = props;
	const html = highlightLine(line.text, language);

	return (
		<div
			data-turn-id={line.turnId}
			data-path={line.path}
			data-line={line.line}
			className="flex items-start gap-0 bg-olive/[0.05] hover:bg-olive/[0.09]"
		>
			<span className="w-11 shrink-0 select-none py-0.5 pr-3 text-right font-mono text-[11px] text-ink-muted/50 tabular-nums">
				{line.line}
			</span>
			<span className="w-4 shrink-0 select-none py-0.5 text-center font-mono text-[12px] text-olive/70">
				+
			</span>
			{html === null && <code className={CODE_CLASS}>{line.text}</code>}
			{html !== null && (
				<code
					className={CODE_CLASS}
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			)}
		</div>
	);
}
