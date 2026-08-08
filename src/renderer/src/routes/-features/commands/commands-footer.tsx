import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PlayIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectCommand } from "@shared/project-commands";
import type { Project } from "@shared/projects";

const ACTION_CLASS = "flex h-7 w-6 items-center justify-center text-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

export function CommandsFooter({
	commands,
	projects,
	open,
	onToggle,
	onRun,
	onRemove,
}: {
	commands: ProjectCommand[];
	projects: readonly Project[];
	open: boolean;
	onToggle: () => void;
	onRun: (command: ProjectCommand) => void;
	onRemove: (commandId: string) => void;
}) {
	const [armedId, setArmedId] = useState<string>();

	return (
		<section data-component="commands-footer" className="flex min-h-0 w-full flex-col border-outline border-b bg-surface-raised">
			<div className="flex h-7 shrink-0 items-center pr-3">
				<button
					type="button"
					data-slot="toggle-commands"
					className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-label text-secondary hover:text-primary"
					aria-expanded={open}
					onClick={onToggle}
				>
					{open
						? <ChevronDownIcon className="size-3" aria-hidden="true" />
						: <ChevronRightIcon className="size-3" aria-hidden="true" />}
					COMMANDS <span className="text-outline-strong">{commands.length}</span>
				</button>
			</div>
			{open && (
				<nav className="min-h-0 flex-1 overflow-auto pb-1" aria-label="Commands">
					{commands.length === 0 && (
						<p data-slot="empty-commands" className="px-3 py-1 text-data text-outline-strong">No commands yet</p>
					)}
					{commands.map((command) => {
						const project = projects.find((candidate) => candidate.id === command.projectId);

						return (
							<div
								key={command.id}
								data-component="sidebar-command-row"
								data-command-id={command.id}
								className="group flex h-7 w-full items-center border-l-2 border-l-transparent pr-3 hover:bg-surface-hover"
								onMouseLeave={() => setArmedId((current) => current === command.id ? undefined : current)}
							>
								<span
									data-slot="command-identity"
									className="flex h-full min-w-0 flex-1 items-center gap-1.5 pl-3 text-left"
								>
									<span className="min-w-0 max-w-1/2 shrink-0 truncate text-body text-secondary">
										{command.label}
									</span>
									{project && (
										<>
											<span className="shrink-0 text-data text-outline-strong" aria-hidden="true">·</span>
											<span className="min-w-0 flex-1 truncate text-data text-outline-strong">{project.name}</span>
										</>
									)}
								</span>
								<button
									type="button"
									data-slot="run-command"
									className={ACTION_CLASS}
									aria-label={`Run ${command.label}`}
									onClick={() => onRun(command)}
								>
									<PlayIcon className="size-3.5" aria-hidden="true" />
								</button>
								{armedId === command.id ? (
									<button
										type="button"
										data-slot="confirm-delete-command"
										className={`${ACTION_CLASS} text-removed`}
										aria-label={`Confirm deleting ${command.label}`}
										onClick={() => {
											setArmedId(undefined);
											onRemove(command.id);
										}}
									>
										<CheckIcon className="size-3.5" aria-hidden="true" />
									</button>
								) : (
									<button
										type="button"
										data-slot="delete-command"
										className={`${ACTION_CLASS} hover:text-removed`}
										aria-label={`Delete ${command.label}`}
										onClick={() => setArmedId(command.id)}
									>
										<TrashIcon className="size-3.5" aria-hidden="true" />
									</button>
								)}
							</div>
						);
					})}
				</nav>
			)}
		</section>
	);
}
