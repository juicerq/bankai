import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";

export function ReviewBrowseEmpty() {
	return (
		<section
			data-component="review-browse-empty"
			className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-surface-raised px-6 text-center"
			aria-label="No file open"
		>
			<DocumentDuplicateIcon className="size-5 text-outline-strong" aria-hidden="true" />
			<p className="text-body text-secondary">Pick a file in the tree to read it.</p>
			<p className="text-data text-outline-strong">Ctrl+X P opens quick open · Diff shows the review</p>
		</section>
	);
}
