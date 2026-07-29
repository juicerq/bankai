import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectCommand } from "@main/store/commands";
import type { Project } from "@main/store/projects";
import { CommandEditor } from "@renderer/routes/-components/command-editor";
import { PickerHint } from "@renderer/routes/-components/picker-hint";
import { useProjectCommands } from "@renderer/routes/-utils/use-project-commands";

const NEW_COMMAND = "new";

export function CommandsModal({
	project,
	onRun,
	onClose,
}: {
	project: Project;
	onRun: (projectId: string, command: Pick<ProjectCommand, "label" | "command">) => void;
	onClose: () => void;
}) {
	const commands = useProjectCommands(project.id);
	const [filter, setFilter] = useState("");
	const [highlightedId, setHighlightedId] = useState<string>();
	const [editing, setEditing] = useState<ProjectCommand | typeof NEW_COMMAND>();
	const term = filter.trim().toLowerCase();
	const items = (commands.commands ?? []).filter((command) =>
		command.label.toLowerCase().includes(term) || command.command.toLowerCase().includes(term)
	);
	const highlighted = items.find((command) => command.id === highlightedId) ?? items[0];

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
		onRun(project.id, command);
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
		run(highlighted);
	};

	return (
		<div
			className="picker-backdrop fixed inset-0 z-50 flex justify-center bg-surface-sunken/70 pt-[14vh]"
			onPointerDown={onClose}
		>
			<div
				data-component="commands-modal"
				data-highlighted={highlighted?.id}
				role="dialog"
				aria-modal="true"
				aria-label={`Commands for ${project.name}`}
				className="picker-enter flex h-fit w-[560px] max-w-[90vw] flex-col border border-outline-strong bg-surface-raised shadow-2xl"
				onPointerDown={(event) => event.stopPropagation()}
			>
				{editing
					? (
						<CommandEditor
							command={editing === NEW_COMMAND ? undefined : editing}
							onSave={(draft) => {
								if (editing === NEW_COMMAND) {
									commands.add(draft);
								} else {
									commands.update(editing.id, draft);
								}

								setEditing(undefined);
							}}
							onCancel={() => setEditing(undefined)}
						/>
					)
					: (
						<>
							<div className="flex items-center gap-2 border-outline border-b px-3 py-2.5">
								<span className="text-body text-tertiary" aria-hidden="true">›</span>
								<input
									data-slot="filter-input"
									autoFocus
									spellCheck={false}
									autoComplete="off"
									aria-label="Filter commands"
									placeholder="Filter commands"
									className="min-w-0 flex-1 bg-transparent text-body text-primary outline-none placeholder:text-secondary"
									value={filter}
									onInput={(event) => {
										setFilter(event.currentTarget.value);
										setHighlightedId(undefined);
									}}
									onKeyDown={handleKeyDown}
								/>
							</div>
							<span className="px-3 pt-2.5 pb-1 text-label text-secondary">RUN IN {project.name}</span>
							<div className="max-h-64 min-h-16 overflow-y-auto" aria-label="Commands">
								{commands.loading && <p className="px-3 py-2 text-data text-secondary">Reading commands…</p>}
								{items.map((command) => (
									<CommandRow
										key={command.id}
										command={command}
										highlighted={command.id === highlighted?.id}
										onHighlight={setHighlightedId}
										onRun={() => run(command)}
										onEdit={() => setEditing(command)}
										onRemove={() => commands.remove(command.id)}
									/>
								))}
								{!commands.loading && items.length === 0 && (
									<p className="px-3 py-2 text-data text-secondary">
										{term ? "No matching commands." : "No commands yet."}
									</p>
								)}
							</div>
							<button
								type="button"
								data-slot="new-command"
								className="flex items-center gap-2 border-outline border-t px-3 py-2 text-left text-label text-secondary hover:bg-surface-hover hover:text-primary"
								onClick={() => setEditing(NEW_COMMAND)}
							>
								<PlusIcon className="size-3.5 shrink-0" aria-hidden="true" />
								NEW COMMAND
							</button>
							<div className="flex items-center gap-3 border-outline border-t px-3 py-2">
								<PickerHint keys={["↑", "↓"]} label="Navigate" />
								<PickerHint keys={["Enter"]} label="Run" />
								<PickerHint keys={["Esc"]} label="Close" />
								{commands.saveError && (
									<span data-slot="save-error" className="min-w-0 flex-1 truncate text-right text-data text-removed">
										Could not save — the change was not applied.
									</span>
								)}
							</div>
						</>
					)}
			</div>
		</div>
	);
}

function CommandRow({
	command,
	highlighted,
	onHighlight,
	onRun,
	onEdit,
	onRemove,
}: {
	command: ProjectCommand;
	highlighted: boolean;
	onHighlight: (id: string) => void;
	onRun: () => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	return (
		<div
			data-component="command-row"
			data-id={command.id}
			className={`group relative flex items-center ${highlighted ? "bg-surface-active" : ""}`}
			onMouseMove={() => onHighlight(command.id)}
		>
			{highlighted && <span className="absolute inset-y-0 left-0 w-0.5 bg-tertiary" aria-hidden="true" />}
			<button
				type="button"
				aria-label={`Run ${command.label}`}
				aria-current={highlighted}
				data-slot="run-command"
				className="flex min-w-0 flex-1 items-baseline gap-3 px-3 py-1.5 text-left"
				onMouseDown={(event) => event.preventDefault()}
				onClick={onRun}
			>
				<span className="shrink-0 truncate text-body text-primary">{command.label}</span>
				<span className="min-w-0 flex-1 truncate text-right text-data text-outline-strong">{command.command}</span>
			</button>
			<CommandRowAction label={`Edit ${command.label}`} onClick={onEdit}>
				<PencilSquareIcon className="size-3.5" aria-hidden="true" />
			</CommandRowAction>
			<CommandRowAction label={`Delete ${command.label}`} danger onClick={onRemove}>
				<TrashIcon className="size-3.5" aria-hidden="true" />
			</CommandRowAction>
		</div>
	);
}

function CommandRowAction({
	label,
	danger,
	onClick,
	children,
}: {
	label: string;
	danger?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			className={`shrink-0 px-2 py-1.5 text-tertiary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ${
				danger ? "hover:text-removed" : "hover:text-primary"
			}`}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
