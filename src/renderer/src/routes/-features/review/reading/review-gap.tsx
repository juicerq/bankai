import { DIFF_GUTTER_WIDTH } from "@renderer/routes/-features/review/reading/review-rows";

const GUTTER_STYLE = { width: DIFF_GUTTER_WIDTH };
const LABEL_STYLE = { left: DIFF_GUTTER_WIDTH };

export function ReviewDiffGap({ skipped }: { skipped: number }) {
	return (
		<div className="flex h-5 w-max min-w-full select-none items-center border-outline border-y bg-surface-sunken text-data text-secondary">
			<span
				style={GUTTER_STYLE}
				className="sticky left-0 flex shrink-0 items-center justify-end self-stretch border-outline border-r bg-surface-sunken pr-2 text-code"
			>
				⋯
			</span>
			<span style={LABEL_STYLE} className="sticky px-3">
				{skipped === 1 ? "1 unchanged line" : `${skipped} unchanged lines`}
			</span>
		</div>
	);
}
