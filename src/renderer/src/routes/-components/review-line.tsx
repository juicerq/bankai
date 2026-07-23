import { Suspense, use } from "react";
import type { DiffLine, ReviewContent } from "@main/git/contracts";
import { reviewHighlights } from "@renderer/routes/-utils/review-highlights";
import type { HighlightedLines, SyntaxSpan, SyntaxTone } from "@renderer/routes/-utils/review-syntax";

const DIFF_MARKERS = { context: " ", add: "+", remove: "−" } as const;

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
			<span className="sticky left-0 flex h-5 w-10 shrink-0 select-none items-center justify-end border-outline border-r bg-surface-sunken pr-2 text-secondary">
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

export function ReviewNotice({ children }: { children: string }) {
	return <div className="flex h-10 min-w-full items-center px-3 text-data text-secondary">{children}</div>;
}

export function reviewContentNotice(content: Exclude<ReviewContent, { status: "ready" }>, full: boolean): string {
	switch (content.status) {
		case "empty":
			return "Empty file.";
		case "binary":
			return "Binary content cannot be shown.";
		case "too-large":
			if (content.lineCount) {
				return `${full ? "Too large to show in full" : "Too large to show"}: ${content.lineCount} lines.`;
			}
			if (full) {
				return "Too large to show in full.";
			}

			return "Too large to show.";
		case "unavailable":
			return "File unavailable. Retrying\u2026";
	}
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
