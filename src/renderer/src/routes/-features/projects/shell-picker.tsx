import { FolderIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Project } from "@shared/projects";
import { PickerFooter, PickerFrame, PickerHeader } from "@renderer/routes/-features/shared/pickers/picker-frame";
import { PickerHint } from "@renderer/routes/-features/shared/pickers/picker-hint";
import { usePickerNavigation } from "@renderer/routes/-features/shared/pickers/use-picker-navigation";

const RECENT_PROJECTS_STORAGE_KEY = "bankai:shell-picker:recent-projects";

export function ShellPicker({
	projects,
	activeProjectId,
	shellCounts,
	onCreate,
	onClose,
}: {
	projects: Project[];
	activeProjectId: string | undefined;
	shellCounts: ReadonlyMap<string, number>;
	onCreate: (projectId: string) => void;
	onClose: () => void;
}) {
	const [filter, setFilter] = useState("");
	const [recentProjectIds] = useState(() => readRecentProjectIds(projects));
	const term = filter.trim().toLowerCase();
	const recentOrder = new Map(recentProjectIds.map((projectId, index) => [projectId, index]));
	// Name only, never the path: a project's name is its directory's basename,
	// so the rest of the path is the one part every project here shares.
	const items = projects
		.filter((project) => project.name.toLowerCase().includes(term))
		.sort((left, right) => {
			const leftIndex = recentOrder.get(left.id);
			const rightIndex = recentOrder.get(right.id);

			if (leftIndex !== undefined || rightIndex !== undefined) {
				return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
			}

			return left.name.localeCompare(right.name);
		});

	const create = (projectId: string) => {
		writeRecentProjectId(projectId, recentProjectIds);
		onClose();
		onCreate(projectId);
	};

	const picker = usePickerNavigation({
		items,
		key: (project) => project.id,
		fallback: (matches) => {
			if (recentProjectIds.length > 0 || term) {
				return matches[0];
			}

			return matches.find((project) => project.id === activeProjectId) ?? matches[0];
		},
		onChoose: (highlighted) => {
			if (highlighted) {
				create(highlighted.id);
			}
		},
		onClose,
	});

	return (
		<PickerFrame
			data-component="shell-picker"
			data-highlighted={picker.highlightedKey}
			onClose={onClose}
		>
			<PickerHeader>
				<span className="text-body text-tertiary" aria-hidden="true">
					›
				</span>
				<input
					data-slot="filter-input"
					autoFocus
					spellCheck={false}
					autoComplete="off"
					aria-label="Project for the new shell"
					placeholder="Filter projects"
					className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
					value={filter}
					onInput={(event) => {
						setFilter(event.currentTarget.value);
						picker.clear();
					}}
					onKeyDown={picker.onKeyDown}
				/>
			</PickerHeader>
			<span className="px-3 pt-2.5 pb-1 text-label text-secondary">NEW SHELL IN</span>
			<div className="min-h-0 flex-1 overflow-y-auto pb-1" role="listbox" aria-label="Projects">
				{items.map((project, index) => (
					<ShellPickerItem
						key={project.id}
						project={project}
						index={index}
						shells={shellCounts.get(project.id) ?? 0}
						{...picker.itemProps(project)}
						onSelect={() => create(project.id)}
					/>
				))}
				{items.length === 0 && <p className="px-3 py-2 text-data text-secondary">No matching projects.</p>}
			</div>
			<PickerFooter>
				<PickerHint keys={["↑", "↓"]} label="Navigate" />
				<PickerHint keys={["Enter"]} label="New shell" />
				<PickerHint keys={["Esc"]} label="Close" />
			</PickerFooter>
		</PickerFrame>
	);
}

function readRecentProjectIds(projects: Project[]): string[] {
	try {
		const stored: unknown = JSON.parse(localStorage.getItem(RECENT_PROJECTS_STORAGE_KEY) ?? "[]");
		if (!Array.isArray(stored)) {
			return [];
		}

		const projectIds = new Set(projects.map((project) => project.id));

		return [...new Set(stored.filter((value): value is string => typeof value === "string" && projectIds.has(value)))];
	} catch {
		return [];
	}
}

function writeRecentProjectId(projectId: string, recentProjectIds: string[]) {
	const next = [projectId, ...recentProjectIds.filter((recentProjectId) => recentProjectId !== projectId)];

	try {
		localStorage.setItem(RECENT_PROJECTS_STORAGE_KEY, JSON.stringify(next));
	} catch {}
}

function ShellPickerItem({
	project,
	index,
	shells,
	highlighted,
	ref,
	onMouseMove,
	onSelect,
}: {
	project: Project;
	index: number;
	shells: number;
	highlighted: boolean;
	ref?: (element: HTMLElement | null) => void;
	onMouseMove: () => void;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={highlighted}
			data-component="shell-picker-item"
			data-name={project.name}
			data-index={index}
			ref={ref}
			className={`group relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : ""
			}`}
			onMouseMove={onMouseMove}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<FolderIcon className="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
			<span className="min-w-0 flex-1 truncate text-body text-primary">{project.name}</span>
			{shells > 0 && (
				<span data-slot="shell-count" className="shrink-0 text-data text-outline-strong">
					{shells} {shells === 1 ? "SHELL" : "SHELLS"}
				</span>
			)}
			<span className="min-w-0 max-w-[45%] shrink truncate text-data text-outline-strong">{project.path}</span>
		</button>
	);
}
