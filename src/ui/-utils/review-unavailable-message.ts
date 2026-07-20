import type { ReviewUnavailableReason } from "@core/harness/Harness";

const MESSAGE: Record<ReviewUnavailableReason, string> = {
	historical: "Review unavailable: this Session was not observed from its beginning.",
	unsafe: "Review unavailable: its transcript evidence could not be verified.",
	"tool-conflict": "Review unavailable: another Pi extension owns write or edit.",
};

export function reviewUnavailableMessage(reason: ReviewUnavailableReason | undefined): string {
	return MESSAGE[reason ?? "unsafe"];
}
