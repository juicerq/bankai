import { Square3Stack3DIcon } from "@heroicons/react/24/outline";
import type { Worktree } from "@shared/review";
import type { AgentActivityState } from "@shared/activity";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "@renderer/routes/-features/shared/menus/dropdown-menu";
import { ACTIVITY_DOT_CLASS } from "@renderer/routes/-features/sessions/list/agent-activity";
import { worktreeLabel } from "@renderer/routes/-features/review/header/review-worktree";

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

function matchWorktrees(worktrees: Worktree[], query: string) {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return worktrees;
	}

	return worktrees.filter((worktree) => `${worktreeLabel(worktree)} ${worktree.path}`.toLowerCase().includes(needle));
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
		<DropdownMenu
			component="review-worktree"
			icon={<Square3Stack3DIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={label}
			ariaLabel={`Worktree: ${label}`}
			title={activePath}
			truncate
			pinned={
				<>
					<DropdownMenuItem
						label="Follow shell"
						detail={shellPath ?? "No agent worktree yet"}
						selected={following}
						onClick={() => onSelect()}
					/>
					{worktrees.length > 0 && <DropdownMenuSeparator />}
				</>
			}
			search={{ placeholder: "Filter worktrees" }}
		>
			{(query) =>
				matchWorktrees(worktrees, query).map((worktree) => {
					const failure = removeFailure?.path === worktree.path ? removeFailure.message : undefined;
					const root = worktree.path === mainPath;
					const state = activity.get(worktree.path);

					return (
						<DropdownMenuItem
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
				})
			}
		</DropdownMenu>
	);
}
