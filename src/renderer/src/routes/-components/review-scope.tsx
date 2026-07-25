import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import type { ReviewMode } from "@main/git/contracts";
import { HeaderMenu, HeaderMenuItem } from "@renderer/routes/-components/header-menu";
import { REVIEW_SCOPE_ORDER, REVIEW_SCOPES } from "@renderer/routes/-utils/review-scope";

export function ReviewScope({ mode, onSelect }: { mode: ReviewMode; onSelect: (mode: ReviewMode) => void }) {
	return (
		<HeaderMenu
			component="review-scope"
			icon={<ArrowsRightLeftIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={REVIEW_SCOPES[mode].label}
			ariaLabel={`Diff scope: ${REVIEW_SCOPES[mode].label}`}
			title={REVIEW_SCOPES[mode].detail}
		>
			{REVIEW_SCOPE_ORDER.map((scope) => (
				<HeaderMenuItem
					key={scope}
					label={REVIEW_SCOPES[scope].label}
					detail={REVIEW_SCOPES[scope].detail}
					selected={scope === mode}
					onClick={() => onSelect(scope)}
				/>
			))}
		</HeaderMenu>
	);
}
