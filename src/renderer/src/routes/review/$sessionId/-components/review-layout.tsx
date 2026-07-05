import { ReviewDiffPanel } from "./review-diff-panel";
import { ReviewFeedbackRail } from "./review-feedback-rail";
import { ReviewTurnRail } from "./review-turn-rail";

export function ReviewLayout() {
	return (
		<div className="flex min-h-0 flex-1">
			<ReviewTurnRail />
			<ReviewDiffPanel />
			<ReviewFeedbackRail />
		</div>
	);
}
