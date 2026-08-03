import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import type { ReviewMode } from "@main/git/git-contracts";
import { DropdownMenu, DropdownMenuItem } from "@renderer/routes/-components/dropdown-menu";
import { REVIEW_SCOPE_ORDER, REVIEW_SCOPES, sharedWorktreeNotice } from "@renderer/routes/-utils/review-scope";

export function ReviewScope({
	mode,
	sharedWith,
	onSelect,
}: {
	mode: ReviewMode;
	sharedWith: string[];
	onSelect: (mode: ReviewMode) => void;
}) {
	const current = REVIEW_SCOPES[mode];
	const shared = mode === "last-turn" && sharedWith.length > 0 ? sharedWorktreeNotice(sharedWith) : undefined;

	return (
		<DropdownMenu
			component="review-scope"
			icon={<ArrowsRightLeftIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={current.label}
			badge={shared && (
				<span data-component="review-scope-shared" title={shared} className="shrink-0 text-label text-tertiary">
					SHARED
				</span>
			)}
			ariaLabel={`Diff scope: ${current.label}${shared ? `, ${shared}` : ""}`}
			title={current.detail}
		>
			{REVIEW_SCOPE_ORDER.map((scope) => (
				<DropdownMenuItem
					key={scope}
					label={REVIEW_SCOPES[scope].label}
					detail={REVIEW_SCOPES[scope].detail}
					selected={scope === mode}
					onClick={() => onSelect(scope)}
				/>
			))}
		</DropdownMenu>
	);
}
