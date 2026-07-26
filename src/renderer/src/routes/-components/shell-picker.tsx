import { useState } from "react";
import type { Project } from "@main/store/projects";
import { PickerHint } from "@renderer/routes/-components/picker-hint";

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
	const [highlightedId, setHighlightedId] = useState<string>();
	const term = filter.trim().toLowerCase();
	// Name only, never the path: a project's name is its directory's basename,
	// so the rest of the path is the one part every project here shares.
	const items = projects
		.filter((project) => project.name.toLowerCase().includes(term))
		.sort((left, right) => left.name.localeCompare(right.name));
	const highlighted = items.find((project) => project.id === highlightedId)
		?? items.find((project) => project.id === activeProjectId)
		?? items[0];

	const moveHighlight = (step: number) => {
		if (items.length === 0) {
			return;
		}

		const current = items.findIndex((project) => project.id === highlighted?.id);
		const next = items[(current + step + items.length) % items.length];
		if (next) {
			setHighlightedId(next.id);
		}
	};

	const create = (projectId: string) => {
		onClose();
		onCreate(projectId);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			onClose();
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			moveHighlight(event.key === "ArrowDown" ? 1 : -1);
			return;
		}

		if (event.key !== "Enter" || !highlighted) {
			return;
		}

		event.preventDefault();
		create(highlighted.id);
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="shell-picker"
				data-highlighted={highlighted?.id}
				className="picker-enter flex h-fit w-[560px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
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
							setHighlightedId(undefined);
						}}
						onKeyDown={handleKeyDown}
					/>
				</div>
				<span className="px-3 pt-2.5 pb-1 text-label text-secondary">NEW SHELL IN</span>
				<div className="h-64 overflow-y-auto pb-1" role="listbox" aria-label="Projects">
					{items.map((project, index) => (
						<ShellPickerItem
							key={project.id}
							project={project}
							index={index}
							shells={shellCounts.get(project.id) ?? 0}
							highlighted={project.id === highlighted?.id}
							onHighlight={setHighlightedId}
							onSelect={() => create(project.id)}
						/>
					))}
					{items.length === 0 && <p className="px-3 py-2 text-data text-secondary">No matching projects.</p>}
				</div>
				<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
					<PickerHint keys={["↑", "↓"]} label="Navigate" />
					<PickerHint keys={["Enter"]} label="New shell" />
					<PickerHint keys={["Esc"]} label="Close" />
				</div>
			</div>
		</div>
	);
}

function ShellPickerItem({
	project,
	index,
	shells,
	highlighted,
	onHighlight,
	onSelect,
}: {
	project: Project;
	index: number;
	shells: number;
	highlighted: boolean;
	onHighlight: (projectId: string) => void;
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
			ref={highlighted ? (element) => element?.scrollIntoView({ block: "nearest" }) : undefined}
			className={`group relative flex w-full items-center gap-2.5 px-3 py-1.5 text-left ${
				highlighted ? "bg-surface-active" : ""
			}`}
			onMouseMove={() => onHighlight(project.id)}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onSelect}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
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
