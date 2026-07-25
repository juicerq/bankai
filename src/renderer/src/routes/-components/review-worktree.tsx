import { Square3Stack3DIcon } from "@heroicons/react/24/outline";
import type { Worktree } from "@main/git/contracts";
import type { AgentActivityState } from "@shared/activity";
import { HeaderMenu, HeaderMenuItem, HeaderMenuSeparator } from "@renderer/routes/-components/header-menu";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-utils/agent-activity";
import { worktreeLabel } from "@renderer/routes/-utils/review-worktree";

export interface ReviewWorktreeSelection {
	worktrees: Worktree[];
	activePath: string;
	mainPath: string;
	pinnedPath: string | undefined;
	shellPath: string | undefined;
	activity: ReadonlyMap<string, AgentActivityState>;
	removeFailure: { path: string; message: string } | undefined;
	onSelect: (path?: string) => void;
	onRemove: (path: string) => void;
}

export function ReviewWorktree({
	worktrees,
	activePath,
	mainPath,
	pinnedPath,
	shellPath,
	activity,
	removeFailure,
	onSelect,
	onRemove,
}: ReviewWorktreeSelection) {
	const active = worktrees.find((worktree) => worktree.path === activePath);
	const label = worktreeLabel(active ?? { path: activePath });
	const following = pinnedPath === undefined;

	return (
		<HeaderMenu
			component="review-worktree"
			icon={<Square3Stack3DIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={label}
			ariaLabel={`Worktree: ${label}`}
			title={activePath}
			truncate
			pinned={
				<>
					<HeaderMenuItem
						label="Follow shell"
						detail={shellPath ?? "No agent worktree yet"}
						selected={following}
						onClick={() => onSelect()}
					/>
					{worktrees.length > 0 && <HeaderMenuSeparator />}
				</>
			}
		>
			{worktrees.map((worktree) => {
				const failure = removeFailure?.path === worktree.path ? removeFailure.message : undefined;
				const root = worktree.path === mainPath;
				const state = activity.get(worktree.path);

				return (
					<HeaderMenuItem
						key={worktree.path}
						label={worktreeLabel(worktree)}
						detail={failure ?? (root ? `root · ${worktree.path}` : worktree.path)}
						detailTone={failure ? "danger" : undefined}
						selected={!following && worktree.path === activePath}
						signal={state === undefined ? undefined : { title: state, className: ACTIVITY_DOT_CLASS[state] }}
						remove={
							root
								? undefined
								: {
										label: `Remove worktree ${worktreeLabel(worktree)}`,
										onConfirm: () => onRemove(worktree.path),
									}
						}
						onClick={() => onSelect(worktree.path)}
					/>
				);
			})}
		</HeaderMenu>
	);
}
