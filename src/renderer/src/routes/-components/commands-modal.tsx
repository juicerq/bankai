import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectCommand } from "@main/store/commands";
import type { Project } from "@main/store/projects";
import { CommandEditor } from "@renderer/routes/-components/command-editor";
import { PickerHint } from "@renderer/routes/-components/picker-hint";
import { useProjectCommands } from "@renderer/routes/-utils/use-project-commands";

const ALL_PROJECTS = "all";
const NEW_COMMAND = "new";

export function CommandsModal({
	projects,
	onRun,
	onClose,
}: {
	projects: readonly Project[];
	onRun: (projectId: string, command: Pick<ProjectCommand, "label" | "command">) => void;
	onClose: () => void;
}) {
	const commands = useProjectCommands(projects);
	const [scopeId, setScopeId] = useState(ALL_PROJECTS);
	const [filter, setFilter] = useState("");
	const [highlightedId, setHighlightedId] = useState<string>();
	const [editing, setEditing] = useState<ProjectCommand | typeof NEW_COMMAND>();
	const term = filter.trim().toLowerCase();
	const selectedProject = projects.find((project) => project.id === scopeId);
	const items = commands.commands.filter((command) => {
		if (selectedProject && command.projectId !== selectedProject.id) {
			return false;
		}

		const project = projects.find((candidate) => candidate.id === command.projectId);
		return command.label.toLowerCase().includes(term)
			|| command.command.toLowerCase().includes(term)
			|| project?.name.toLowerCase().includes(term);
	});
	const highlighted = items.find((command) => command.id === highlightedId) ?? items[0];
	const scopes = [ALL_PROJECTS, ...projects.map((project) => project.id)];
	const scopeLoading = selectedProject
		? commands.pendingProjectIds.includes(selectedProject.id)
		: commands.pendingProjectIds.length > 0;
	const scopeLoadError = selectedProject
		? commands.failedProjectIds.includes(selectedProject.id)
		: commands.failedProjectIds.length > 0;

	const selectScope = (nextScopeId: string) => {
		setScopeId(nextScopeId);
		setHighlightedId(undefined);
	};

	const moveScope = (step: number) => {
		const current = scopes.indexOf(scopeId);
		selectScope(scopes[(current + step + scopes.length) % scopes.length] ?? ALL_PROJECTS);
	};

	const moveHighlight = (step: number) => {
		if (items.length === 0) {
			return;
		}

		const current = items.findIndex((command) => command.id === highlighted?.id);
		const next = items[(current + step + items.length) % items.length];
		if (next) {
			setHighlightedId(next.id);
		}
	};

	const run = (command: ProjectCommand) => {
		onClose();
		onRun(command.projectId, command);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Escape") {
			onClose();
			return;
		}

		if (event.ctrlKey && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
			event.preventDefault();
			moveScope(event.key === "ArrowRight" ? 1 : -1);
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
		run(highlighted);
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[10vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="commands-modal"
				data-scope={scopeId}
				data-highlighted={highlighted?.id}
				role="dialog"
				aria-modal="true"
				aria-label="Commands"
				className="picker-enter flex h-[min(620px,80vh)] w-[820px] max-w-[94vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
					<span className="text-body text-tertiary" aria-hidden="true">›</span>
					<input
						data-slot="filter-input"
						autoFocus
						spellCheck={false}
						autoComplete="off"
						aria-label="Filter commands"
						placeholder="Search commands and projects"
						className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
						value={filter}
						onInput={(event) => {
							setFilter(event.currentTarget.value);
							setHighlightedId(undefined);
						}}
						onKeyDown={handleKeyDown}
					/>
					<span className="shrink-0 text-label text-tertiary">
						{selectedProject ? selectedProject.name : "ALL PROJECTS"}
					</span>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
					<aside className="flex min-h-0 flex-col border-outline border-r">
						<span className="px-3 pt-3 pb-1.5 text-label text-secondary">PROJECTS</span>
						<div className="min-h-0 flex-1 overflow-y-auto pb-2" aria-label="Command projects">
							<ScopeRow
								id={ALL_PROJECTS}
								name="All projects"
								count={commands.commands.length}
								selected={scopeId === ALL_PROJECTS}
								onSelect={selectScope}
							/>
							{projects.map((project) => (
								<ScopeRow
									key={project.id}
									id={project.id}
									name={project.name}
									count={commands.commands.filter((command) => command.projectId === project.id).length}
									selected={scopeId === project.id}
									onSelect={selectScope}
								/>
							))}
						</div>
					</aside>
					<section className="flex min-h-0 min-w-0 flex-col">
						{editing ? (
							<CommandEditor
								command={editing === NEW_COMMAND ? undefined : editing}
								projects={projects}
								projectId={editing === NEW_COMMAND ? selectedProject?.id : editing.projectId}
								onSave={(projectId, draft) => {
									if (editing === NEW_COMMAND) {
										commands.add(projectId, draft);
									} else {
										commands.update(editing.id, draft);
									}

									setEditing(undefined);
								}}
								onCancel={() => setEditing(undefined)}
							/>
						) : (
							<>
								<div className="flex items-center justify-between px-3 pt-3 pb-1.5">
									<span className="text-label text-secondary">
										{selectedProject ? `RUN IN ${selectedProject.name}` : "COMMANDS"}
									</span>
									<span className="text-data text-tertiary">{items.length} VISIBLE</span>
								</div>
								<div className="min-h-0 flex-1 overflow-y-auto pb-1" aria-label="Commands">
									{scopeLoading && (
										<p data-slot="loading" className="px-3 py-2 text-data text-secondary">Reading commands…</p>
									)}
									{scopeLoadError && (
										<p data-slot="load-error" className="px-3 py-2 text-data text-removed">
											Commands for this scope could not be read.
										</p>
									)}
									{items.map((command) => (
										<CommandRow
											key={command.id}
											command={command}
											project={projects.find((project) => project.id === command.projectId)}
											showProject={!selectedProject}
											highlighted={command.id === highlighted?.id}
											onHighlight={setHighlightedId}
											onRun={() => run(command)}
											onEdit={() => setEditing(command)}
											onRemove={() => commands.remove(command.id)}
										/>
									))}
									{!scopeLoading && !scopeLoadError && items.length === 0 && (
										<p data-slot="empty" className="px-3 py-2 text-data text-secondary">
											{term ? "No matching commands in this scope." : "No commands in this scope yet."}
										</p>
									)}
								</div>
								<button
									type="button"
									data-slot="new-command"
									className="flex items-center gap-2 border-outline border-t px-3 py-2 text-left text-label text-secondary hover:bg-surface-hover hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => setEditing(NEW_COMMAND)}
								>
									<PlusIcon className="size-3.5 shrink-0" aria-hidden="true" />
									NEW COMMAND
								</button>
							</>
						)}
					</section>
				</div>
				<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
					<PickerHint keys={["Ctrl", "←", "→"]} label="Project" />
					<PickerHint keys={["↑", "↓"]} label="Navigate" />
					<PickerHint keys={["Enter"]} label="Run" />
					<PickerHint keys={["Esc"]} label="Close" />
					{commands.saveError && (
						<span data-slot="save-error" className="min-w-0 flex-1 truncate text-right text-data text-removed">
							Could not save — the change was not applied.
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function ScopeRow({
	id,
	name,
	count,
	selected,
	onSelect,
}: {
	id: string;
	name: string;
	count: number;
	selected: boolean;
	onSelect: (id: string) => void;
}) {
	return (
		<button
			type="button"
			data-component="command-scope"
			data-scope-id={id}
			data-count={count}
			aria-current={selected}
			className={`relative flex w-full items-center gap-2 px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring ${
				selected ? "bg-surface-active" : "hover:bg-surface-hover"
			}`}
			onClick={() => onSelect(id)}
		>
			{selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<span className="min-w-0 flex-1 truncate text-body text-primary">{name}</span>
			<span data-slot="command-count" className="shrink-0 text-data text-tertiary">{count}</span>
		</button>
	);
}

function CommandRow({
	command,
	project,
	showProject,
	highlighted,
	onHighlight,
	onRun,
	onEdit,
	onRemove,
}: {
	command: ProjectCommand;
	project: Project | undefined;
	showProject: boolean;
	highlighted: boolean;
	onHighlight: (id: string) => void;
	onRun: () => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	return (
		<div
			data-component="command-row"
			data-command-id={command.id}
			data-project-id={command.projectId}
			data-project-name={showProject ? project?.name : undefined}
			className={`group relative flex items-center ${highlighted ? "bg-surface-active" : ""}`}
			onMouseMove={() => onHighlight(command.id)}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<button
				type="button"
				aria-label={`Run ${command.label}`}
				aria-current={highlighted}
				data-slot="run-command"
				className="grid min-w-0 flex-1 grid-cols-[minmax(100px,0.7fr)_minmax(0,1.3fr)] items-baseline gap-3 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
				onMouseDown={(event) => event.preventDefault()}
				onClick={onRun}
			>
				<span className="min-w-0 truncate text-body text-primary">{command.label}</span>
				<span className="min-w-0 truncate text-data text-outline-strong">{command.command}</span>
				{showProject && (
					<span data-slot="project-name" className="col-span-2 -mt-1 truncate text-data text-tertiary">
						{project?.name}
					</span>
				)}
			</button>
			<CommandRowAction slotName="edit-command" label={`Edit ${command.label}`} onClick={onEdit}>
				<PencilSquareIcon className="size-3.5" aria-hidden="true" />
			</CommandRowAction>
			<CommandRowAction slotName="delete-command" label={`Delete ${command.label}`} danger onClick={onRemove}>
				<TrashIcon className="size-3.5" aria-hidden="true" />
			</CommandRowAction>
		</div>
	);
}

function CommandRowAction({
	slotName,
	label,
	danger,
	onClick,
	children,
}: {
	slotName: string;
	label: string;
	danger?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			data-slot={slotName}
			aria-label={label}
			className={`shrink-0 px-2 py-2 text-tertiary opacity-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring group-hover:opacity-100 focus-visible:opacity-100 ${
				danger ? "hover:text-removed" : "hover:text-primary"
			}`}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
