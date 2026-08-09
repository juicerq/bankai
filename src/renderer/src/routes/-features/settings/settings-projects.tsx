import { EllipsisHorizontalIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@shared/projects";
import { ConfirmDialog } from "@renderer/routes/-features/shared/interaction/confirm-dialog";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";
import { SettingBlock } from "@renderer/routes/-features/settings/settings-controls";

export function SettingsProjects({
	projects,
	shellCounts,
	onOpenDirectory,
	onRemove,
}: {
	projects: Project[];
	shellCounts: ReadonlyMap<string, number>;
	onOpenDirectory: (projectId: string) => void;
	onRemove: (projectId: string) => void;
}) {
	const [menu, setMenu] = useState<{ project: Project; x: number; y: number }>();
	const [confirming, setConfirming] = useState<Project>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const cancelRemoval = useCallback(() => setConfirming(undefined), []);
	const registerMenuDismissal = useMenuDismissal(closeMenu);
	const sorted = [...projects].sort((left, right) => left.name.localeCompare(right.name));

	const requestRemoval = (project: Project) => {
		closeMenu();
		if (!shellCounts.get(project.id)) {
			onRemove(project.id);
			return;
		}

		setConfirming(project);
	};

	return (
		<SettingBlock
			title="Projects"
			description="Working directories available for new sessions."
		>
			<div data-component="settings-projects" className="max-h-48 overflow-y-auto border border-outline">
				{sorted.length === 0 && (
					<p className="px-2 py-2 text-data text-secondary">No projects added.</p>
				)}
				{sorted.map((project) => (
					<div
						key={project.id}
						data-component="settings-project"
						data-project-id={project.id}
						className="flex h-9 items-center gap-2 border-b border-outline px-2 last:border-b-0"
					>
						<span className="min-w-0 flex-1 truncate text-body text-primary" title={project.name}>
							{project.name}
						</span>
						<span className="min-w-0 max-w-1/2 shrink truncate text-data text-secondary" title={project.path}>
							{project.path}
						</span>
						<button
							type="button"
							data-slot="project-actions"
							className="flex size-6 shrink-0 items-center justify-center text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							aria-label={`Actions for ${project.name}`}
							onClick={(event) => setMenu({ project, x: event.clientX, y: event.clientY })}
						>
							<EllipsisHorizontalIcon className="size-4" aria-hidden="true" />
						</button>
					</div>
				))}
			</div>
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component="settings-project-menu"
					role="menu"
					aria-label={`Actions for ${menu.project.name}`}
					className="fixed z-50 min-w-44 border border-outline-strong bg-surface-raised text-body shadow-lg"
					style={{
						left: Math.min(menu.x, window.innerWidth - 184),
						top: Math.min(menu.y, window.innerHeight - 112),
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<button
						type="button"
						role="menuitem"
						data-slot="open-project-directory"
						className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover"
						onClick={() => {
							closeMenu();
							onOpenDirectory(menu.project.id);
						}}
					>
						Open folder
					</button>
					<button
						type="button"
						role="menuitem"
						data-slot="copy-project-path"
						className="block w-full px-3 py-2 text-left text-primary hover:bg-surface-hover"
						onClick={() => {
							closeMenu();
							void navigator.clipboard.writeText(menu.project.path);
						}}
					>
						Copy path
					</button>
					<div className="border-outline border-t" />
					<button
						type="button"
						role="menuitem"
						data-slot="remove-project"
						className="block w-full px-3 py-2 text-left text-removed hover:bg-surface-hover"
						onClick={() => requestRemoval(menu.project)}
					>
						Remove from list
					</button>
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
		</SettingBlock>
	);
}
