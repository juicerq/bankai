import { XMarkIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function ContinuityFailedNotice() {
	const [dismissed, setDismissed] = useState(false);

	if (dismissed) {
		return null;
	}

	return (
		<div
			data-component="continuity-failed-notice"
			className="notice-enter fixed bottom-4 left-4 z-50 flex items-center gap-3 border border-outline bg-surface-raised py-2 pr-2 pl-3"
		>
			<span className="size-[6px] shrink-0 rounded-full bg-tertiary" />
			<div className="flex flex-col leading-tight">
				<span className="text-label text-tertiary">RESTORE FAILED</span>
				<span className="text-secondary text-support">Shells started fresh</span>
			</div>
			<button
				type="button"
				data-slot="dismiss"
				aria-label="Dismiss restore notice"
				className="ml-1 flex size-6 items-center justify-center text-secondary hover:text-primary"
				onClick={() => setDismissed(true)}
			>
				<XMarkIcon className="size-4" />
			</button>
		</div>
	);
}
