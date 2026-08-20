import { CheckIcon, EyeSlashIcon, FunnelIcon } from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@shared/projects";
import type { ProjectMark, ProjectMarks } from "@renderer/routes/-features/projects/use-project-narrowing";
import { SidebarIconButton } from "@renderer/routes/-features/sessions/list/sidebar-icon-button";
import { useMenuDismissal } from "@renderer/routes/-features/shared/menus/use-menu-dismissal";

const MENU_WIDTH = 236;
const MENU_MAX_HEIGHT = 320;
const MENU_MARGIN = 4;

const MARK_HINT: Record<ProjectMark, string> = {
	chosen: "Showing only this project — click to hide it",
	excluded: "Hidden — click to show every project again",
};

export function ProjectFilter({
	projects,
	openProjectIds,
	marks,
	onToggle,
	onExclude,
}: {
	projects: Project[];
	openProjectIds: ReadonlySet<string>;
	marks: ProjectMarks;
	onToggle: (projectId: string) => void;
	onExclude: (projectId: string) => void;
}) {
	const [menu, setMenu] = useState<{ x: number; y: number }>();
	const closeMenu = useCallback(() => setMenu(undefined), []);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const registerMenuDismissal = useMenuDismissal(closeMenu, triggerRef);

	const listed = projects
		.filter((project) => openProjectIds.has(project.id) || marks.has(project.id))
		.sort((left, right) => left.name.localeCompare(right.name));

	if (listed.length < 2) {
		return null;
	}

	const narrowed = listed.some((project) => marks.has(project.id));

	return (
		<>
			<SidebarIconButton
				slot="project-filter"
				buttonRef={triggerRef}
				label="Filter sessions by project"
				title={narrowed ? "Filtered by project" : "Filter sessions by project"}
				active={!!menu || narrowed}
				expanded={!!menu}
				onClick={() => {
					if (menu) {
						closeMenu();
						return;
					}

					const rect = triggerRef.current?.getBoundingClientRect();
					if (rect) {
						setMenu({ x: rect.right - MENU_WIDTH, y: rect.bottom });
					}
				}}
			>
				<FunnelIcon
					className={`size-4 ${narrowed ? "fill-current" : ""}`}
					aria-hidden="true"
				/>
			</SidebarIconButton>
			{menu && createPortal(
				<div
					ref={registerMenuDismissal}
					data-component="project-narrowing"
					role="group"
					aria-label="Narrow sessions to projects"
					className="fixed z-50 flex flex-col border border-outline-strong bg-surface-raised shadow-lg"
					style={{
						left: Math.max(MENU_MARGIN, menu.x),
						top: Math.min(menu.y, window.innerHeight - MENU_MAX_HEIGHT),
						width: MENU_WIDTH,
						maxHeight: MENU_MAX_HEIGHT,
					}}
					onPointerDown={(event) => event.stopPropagation()}
				>
					<div className="min-h-0 overflow-auto">
						{listed.map((project) => (
							<ProjectChoice
								key={project.id}
								project={project}
								mark={marks.get(project.id)}
								onToggle={onToggle}
								onExclude={onExclude}
							/>
						))}
					</div>
					{narrowed && (
						<button
							type="button"
							data-slot="clear-project-filter"
							className="shrink-0 border-outline border-t px-3 py-2 text-left text-data text-secondary hover:bg-surface-hover hover:text-primary"
							onClick={() => {
								for (const [projectId, mark] of marks) {
									if (mark === "chosen") {
										onToggle(projectId);
									} else {
										onExclude(projectId);
									}
								}
							}}
						>
							Show every project
						</button>
					)}
				</div>,
				document.body,
			)}
		</>
	);
}

function ProjectChoice({
	project,
	mark,
	onToggle,
	onExclude,
}: {
	project: Project;
	mark: ProjectMark | undefined;
	onToggle: (projectId: string) => void;
	onExclude: (projectId: string) => void;
}) {
	return (
		<button
			type="button"
			data-component="project-choice"
			data-project-id={project.id}
			data-mark={mark}
			role="menuitemcheckbox"
			aria-checked={mark === "chosen"}
			title={mark ? MARK_HINT[mark] : `${project.path} — click to show only this project`}
			className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover"
			onClick={() => (mark ? onExclude(project.id) : onToggle(project.id))}
		>
			<span className="flex size-4 shrink-0 items-center justify-center text-secondary">
				{mark === "chosen" && <CheckIcon className="size-3.5 text-primary" aria-hidden="true" />}
				{mark === "excluded" && <EyeSlashIcon className="size-3.5 text-outline-strong" aria-hidden="true" />}
			</span>
			<span className="min-w-0 flex-1">
				<span
					className={`block truncate text-body ${
						mark === "excluded" ? "text-outline-strong line-through" : "text-primary"
					}`}
				>
					{project.name}
				</span>
				<span className="block truncate text-data text-secondary">{project.path}</span>
			</span>
		</button>
	);
}
