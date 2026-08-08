import { Suspense, use } from "react";
import type { DiffLine } from "@shared/review";
import { reviewHighlights } from "@renderer/routes/-features/review/reading/review-highlights";
import { DIFF_GUTTER_WIDTH } from "@renderer/routes/-features/review/reading/review-rows";
import type { HighlightedLines, SyntaxSpan, SyntaxTone } from "@renderer/routes/-features/review/reading/review-syntax";

const DIFF_MARKERS = { context: " ", add: "+", remove: "−" } as const;

const GUTTER_STYLE = { width: DIFF_GUTTER_WIDTH };

const DIFF_INK = {
	context: "diff-line-context",
	add: "diff-line-add",
	remove: "diff-line-remove",
} as const;

const DIFF_MARKER_INK = {
	context: "text-primary",
	add: "text-added",
	remove: "text-removed",
} as const;

const SYNTAX_CLASS: Record<SyntaxTone, string> = {
	plain: "syntax-plain",
	comment: "syntax-comment",
	keyword: "syntax-keyword",
	string: "syntax-string",
	constant: "syntax-constant",
	entity: "syntax-entity",
	type: "syntax-type",
};

export function ReviewDiffLine({
	path,
	line,
	lines,
	lineIndex,
}: {
	path: string;
	line: DiffLine;
	lines: DiffLine[];
	lineIndex: number;
}) {
	const highlights = reviewHighlights(path, lines);

	return (
		<div className={`diff-line flex h-5 min-w-full w-max items-center text-code text-primary ${DIFF_INK[line.kind]}`}>
			<span
				style={GUTTER_STYLE}
				className="sticky left-0 flex h-5 shrink-0 select-none items-center justify-end border-outline border-r bg-surface-sunken pr-2 text-secondary"
			>
				{line.number ?? line.oldNumber}
			</span>
			<code className="whitespace-pre">
				<span className={`select-none ${DIFF_MARKER_INK[line.kind]}`}>{DIFF_MARKERS[line.kind]} </span>
				{!highlights && line.content}
				{!!highlights && (
					<Suspense fallback={line.content}>
						<ReviewHighlightedCode content={line.content} highlights={highlights} lineIndex={lineIndex} />
					</Suspense>
				)}
			</code>
		</div>
	);
}

export function ReviewNotice({ reason, children }: { reason?: string; children: string }) {
	return (
		<div
			data-component="review-notice"
			data-reason={reason}
			className="flex h-10 min-w-full items-center px-3 text-data text-secondary"
		>
			{children}
		</div>
	);
}

function ReviewHighlightedCode({
	content,
	highlights,
	lineIndex,
}: {
	content: string;
	highlights: Promise<HighlightedLines | null>;
	lineIndex: number;
}) {
	const spans = use(highlights)?.[lineIndex];
	if (!spans) {
		return content;
	}

	return <>{renderSpans(content, spans)}</>;
}

function renderSpans(content: string, spans: SyntaxSpan[]) {
	let offset = 0;
	const rendered = spans.map((span, index) => {
		const start = offset;
		offset += span.length;

		return (
			<span className={SYNTAX_CLASS[span.tone]} key={`${start}:${index}`}>
				{content.slice(start, offset)}
			</span>
		);
	});

	if (offset < content.length) {
		rendered.push(<span key={offset}>{content.slice(offset)}</span>);
	}

	return rendered;
}
