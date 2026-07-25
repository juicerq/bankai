import { Square3Stack3DIcon } from "@heroicons/react/24/outline";
import type { Worktree } from "@main/git/contracts";
import { HeaderMenu, HeaderMenuItem, HeaderMenuSeparator } from "@renderer/routes/-components/header-menu";
import { worktreeLabel } from "@renderer/routes/-utils/review-worktree";

export interface ReviewWorktreeSelection {
	worktrees: Worktree[];
	activePath: string;
	pinnedPath: string | undefined;
	shellPath: string | undefined;
	onSelect: (path?: string) => void;
}

export function ReviewWorktree(selection: ReviewWorktreeSelection) {
	if (selection.worktrees.length < 2) {
		return null;
	}

	const active = selection.worktrees.find((worktree) => worktree.path === selection.activePath);

	return (
		<HeaderMenu
			component="review-worktree"
			icon={<Square3Stack3DIcon className="size-4 shrink-0" aria-hidden="true" />}
			label={active ? worktreeLabel(active) : selection.activePath}
			ariaLabel={`Worktree: ${active ? worktreeLabel(active) : selection.activePath}`}
			title={selection.activePath}
			truncate
		>
			<ReviewWorktreeItems {...selection} />
		</HeaderMenu>
	);
}

export function ReviewWorktreeItems({
	worktrees,
	activePath,
	pinnedPath,
	shellPath,
	onSelect,
}: ReviewWorktreeSelection) {
	const following = pinnedPath === undefined;

	return (
		<>
			<HeaderMenuItem
				label="Follow shell"
				detail={shellPath ?? "No agent worktree yet"}
				selected={following}
				onClick={() => onSelect()}
			/>
			<HeaderMenuSeparator />
			{worktrees.map((worktree) => (
				<HeaderMenuItem
					key={worktree.path}
					label={worktreeLabel(worktree)}
					detail={worktree.path}
					selected={!following && worktree.path === activePath}
					live={worktree.path === shellPath ? { title: "The active shell's agent works here" } : undefined}
					onClick={() => onSelect(worktree.path)}
				/>
			))}
		</>
	);
}
