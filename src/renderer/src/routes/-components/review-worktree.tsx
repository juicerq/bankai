import { Square3Stack3DIcon } from "@heroicons/react/24/outline";
import type { Worktree } from "@main/git/contracts";
import { HeaderMenu, HeaderMenuItem, HeaderMenuSeparator } from "@renderer/routes/-components/header-menu";
import { worktreeLabel } from "@renderer/routes/-utils/review-worktree";

export interface ReviewWorktreeSelection {
	worktrees: Worktree[];
	activePath: string;
	mainPath: string;
	pinnedPath: string | undefined;
	shellPath: string | undefined;
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
	removeFailure,
	onSelect,
	onRemove,
}: ReviewWorktreeSelection) {
	if (worktrees.length < 2) {
		return null;
	}

	const active = worktrees.find((worktree) => worktree.path === activePath);
	const following = pinnedPath === undefined;

	return (
		<HeaderMenu
			component="review-worktree"
			icon={<Square3Stack3DIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={active ? worktreeLabel(active) : activePath}
			ariaLabel={`Worktree: ${active ? worktreeLabel(active) : activePath}`}
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
					<HeaderMenuSeparator />
				</>
			}
		>
			{worktrees.map((worktree) => {
				const failure = removeFailure?.path === worktree.path ? removeFailure.message : undefined;

				return (
					<HeaderMenuItem
						key={worktree.path}
						label={worktreeLabel(worktree)}
						detail={failure ?? worktree.path}
						detailTone={failure ? "danger" : undefined}
						selected={!following && worktree.path === activePath}
						live={worktree.path === shellPath ? { title: "The active shell's agent works here" } : undefined}
						badge={
							worktree.path === mainPath ? { label: "root", title: "The project's own checkout" } : undefined
						}
						remove={
							worktree.path === mainPath
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
