import { ReviewQuickOpenContent } from "@renderer/routes/-features/review/header/review-quick-open/content";
import {
	ReviewQuickOpenProvider,
	type ReviewQuickOpenOptions,
	useReviewQuickOpen,
} from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open-context";
import { ReviewQuickOpenPaths } from "@renderer/routes/-features/review/header/review-quick-open/paths";

export function ReviewQuickOpen(options: ReviewQuickOpenOptions) {
	return (
		<ReviewQuickOpenProvider options={options}>
			<ReviewQuickOpenDialog />
		</ReviewQuickOpenProvider>
	);
}

function ReviewQuickOpenDialog() {
	const { dialog, paths, content } = useReviewQuickOpen();

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={dialog.onClose}
		>
			<div
				data-component="review-quick-open"
				data-mode={dialog.mode}
				data-status={dialog.status}
				data-highlighted={dialog.mode === "paths" ? paths.picker.highlightedKey : content.picker.highlightedKey}
				className="picker-enter flex h-fit w-[640px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={(event) => {
					if (dialog.mode === "content" && event.key === "Escape") {
						event.preventDefault();
						content.onBack();
					}
				}}
			>
				{dialog.mode === "paths" ? <ReviewQuickOpenPaths /> : <ReviewQuickOpenContent />}
			</div>
		</div>
	);
}
