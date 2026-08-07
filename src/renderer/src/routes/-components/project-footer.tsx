import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@main/store/projects";
import { ConfirmDialog } from "@renderer/routes/-components/confirm-dialog";
import { MenuItem } from "@renderer/routes/-components/menu-item";
import { useMenuDismissal } from "@renderer/routes/-utils/use-menu-dismissal";

export function ProjectFooter({
	projects,
	loading,
	open,
	shellCounts,
	chosenProjectIds,
	onToggle,
	onToggleProject,
	onAdd,
	onOpenDirectory,
	onRemove,
	onOverlayChange,
}: {
	projects: Project[];
	loading: boolean;
	open: boolean;
	shellCounts: ReadonlyMap<string, number>;
	chosenProjectIds: ReadonlySet<string>;
	onToggle: () => void;
	onToggleProject: (projectId: string) => void;
	onAdd: () => void;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
	onOverlayChange?: (active: boolean, dismiss?: () => void) => void;
}) {
	const [menu, setMenu] = useState<{ project: Project; x: number; y: number }>();
	const [confirming, setConfirming] = useState<Project>();
	const closeMenu = useCallback(() => {
		setMenu(undefined);
		onOverlayChange?.(false);
	}, [onOverlayChange]);
	const cancelRemoval = useCallback(() => {
		setConfirming(undefined);
		onOverlayChange?.(false);
	}, [onOverlayChange]);
	const registerMenuDismissal = useMenuDismissal(closeMenu);
	const sorted = [...projects].sort((left, right) => left.name.localeCompare(right.name));

	const requestRemoval = (project: Project) => {
		if (!shellCounts.get(project.id)) {
			onRemove(project.id);
			return;
		}

		setConfirming(project);
		onOverlayChange?.(true, cancelRemoval);
	};

	return (
		<section data-component="project-footer" className="flex min-h-0 w-full flex-col bg-surface-raised">
			<div className="flex h-7 shrink-0 items-center pr-3">
				<button
					type="button"
					data-slot="toggle-projects"
					className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-label text-secondary hover:text-primary"
					aria-expanded={open}
					onClick={onToggle}
				>
					{open
						? <ChevronDownIcon className="size-3" aria-hidden="true" />
						: <ChevronRightIcon className="size-3" aria-hidden="true" />}
					PROJECTS <span className="text-outline-strong">{projects.length}</span>
				</button>
				<button
					type="button"
					data-slot="add-project"
					className="shrink-0 text-secondary hover:text-primary"
					onClick={onAdd}
					aria-label="Add project"
				>
					<PlusIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
			{open && (
				<nav className="min-h-0 flex-1 overflow-auto pb-1" aria-label="Projects">
					{loading && <div className="px-3 py-1 text-data text-secondary">Loading workspace...</div>}
					{sorted.map((project) => {
						const chosen = chosenProjectIds.has(project.id);

						return (
							<button
								key={project.id}
								type="button"
								data-component="project-row"
								data-project-id={project.id}
								aria-pressed={chosen}
								className={`group flex h-7 w-full items-center gap-2 border-l-2 px-3 text-left hover:bg-surface-hover ${
									chosen ? "border-l-tertiary" : "border-l-transparent"
								}`}
								onClick={() => onToggleProject(project.id)}
								onContextMenu={(event) => {
									event.preventDefault();
									setMenu({ project, x: event.clientX, y: event.clientY });
									onOverlayChange?.(true, closeMenu);
								}}
							>
								<span className="min-w-0 flex-1 truncate text-body text-secondary group-hover:text-primary">
									{project.name}
								</span>
								<span className="min-w-0 max-w-[55%] shrink truncate text-data text-outline-strong">
									{project.path}
								</span>
							</button>
						);
					})}
				</nav>
			)}
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component="project-row-menu"
					role="menu"
					aria-label={`Actions for ${menu.project.name}`}
					className="fixed z-50 min-w-44 border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{
						left: Math.min(menu.x, window.innerWidth - 184),
						top: Math.min(menu.y, window.innerHeight - 112),
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<MenuItem
						label="Open folder"
						onClick={() => {
							closeMenu();
							onOpenDirectory(menu.project.id);
						}}
					/>
					<MenuItem
						label="Copy path"
						onClick={() => {
							closeMenu();
							void navigator.clipboard.writeText(menu.project.path);
						}}
					/>
					<div className="border-outline border-t" />
					<MenuItem
						label="Remove from list"
						danger
						onClick={() => {
							setMenu(undefined);
							requestRemoval(menu.project);
						}}
					/>
				</div>,
				document.body,
			)}
			{confirming && (
				<ConfirmDialog
					component="remove-project-confirm"
					title="REMOVE PROJECT"
					label={`Remove ${confirming.name}`}
					action="REMOVE"
					danger
					onCancel={cancelRemoval}
					onConfirm={() => {
						const projectId = confirming.id;
						cancelRemoval();
						onRemove(projectId);
					}}
				>
					{confirming.name} has {shellCounts.get(confirming.id)} open{" "}
					{shellCounts.get(confirming.id) === 1 ? "shell" : "shells"}. Removing it closes them.
				</ConfirmDialog>
			)}
		</section>
	);
}
