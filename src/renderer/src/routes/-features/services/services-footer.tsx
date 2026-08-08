import {
	ArrowPathIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import type { ProjectCommand } from "@shared/project-commands";
import type { Project } from "@shared/projects";
import type { ServiceState, ServiceStatus } from "@shared/services";

const STATUS_DOT: Record<ServiceStatus, string> = {
	running: "bg-added",
	stopped: "bg-outline-strong",
	failed: "bg-removed",
};

const ACTION_CLASS = "flex h-7 w-6 items-center justify-center text-secondary hover:text-primary";

export function ServicesFooter({
	services,
	projects,
	open,
	states,
	openedCommandId,
	onToggle,
	onStart,
	onStop,
	onRestart,
	onRemove,
	onOpenLog,
}: {
	services: ProjectCommand[];
	projects: readonly Project[];
	open: boolean;
	states: ReadonlyMap<string, ServiceState>;
	openedCommandId: string | undefined;
	onToggle: () => void;
	onStart: (commandId: string) => void;
	onStop: (commandId: string) => void;
	onRestart: (commandId: string) => void;
	onRemove: (commandId: string) => void;
	onOpenLog: (commandId: string) => void;
}) {
	const [armedId, setArmedId] = useState<string>();

	const running = services.filter((service) => states.get(service.id)?.status === "running").length;

	return (
		<section data-component="services-footer" className="flex min-h-0 w-full flex-col border-outline border-b bg-surface-raised">
			<div className="flex h-7 shrink-0 items-center pr-3">
				<button
					type="button"
					data-slot="toggle-services"
					className="flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-label text-secondary hover:text-primary"
					aria-expanded={open}
					onClick={onToggle}
				>
					{open
						? <ChevronDownIcon className="size-3" aria-hidden="true" />
						: <ChevronRightIcon className="size-3" aria-hidden="true" />}
					SERVICES <span className="text-outline-strong">{running}/{services.length}</span>
				</button>
			</div>
			{open && (
				<nav className="min-h-0 flex-1 overflow-auto pb-1" aria-label="Services">
					{services.length === 0 && (
						<p data-slot="empty-services" className="px-3 py-1 text-data text-outline-strong">No services yet</p>
					)}
					{services.map((service) => {
						const state = states.get(service.id);
						const status = state?.status ?? "stopped";
						const project = projects.find((candidate) => candidate.id === service.projectId);

						return (
							<div
								key={service.id}
								data-component="service-row"
								data-command-id={service.id}
								data-status={status}
								className={`group relative flex h-7 w-full items-center border-l-2 pr-3 ${
									service.id === openedCommandId ? "border-l-tertiary bg-surface-active" : "border-l-transparent"
								} hover:bg-surface-hover`}
								onMouseLeave={() => setArmedId((current) => (current === service.id ? undefined : current))}
							>
								<span className="flex h-full shrink-0 items-center px-3">
									<span
										data-slot="service-status"
										role="img"
										aria-label={`${service.label} is ${status}`}
										className={`size-[6px] rounded-full ${STATUS_DOT[status]} ${
											status === "running" ? "pending-pulse" : ""
										}`}
									/>
								</span>
								<button
									type="button"
									data-slot="open-service-log"
									aria-label={`Open ${service.label} output`}
									className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => onOpenLog(service.id)}
								>
									<span className="min-w-0 max-w-1/2 shrink-0 truncate text-body text-secondary group-hover:text-primary">
										{service.label}
									</span>
									{project && (
										<>
											<span className="shrink-0 text-data text-outline-strong" aria-hidden="true">·</span>
											<span data-slot="service-project" className="min-w-0 flex-1 truncate text-data text-outline-strong">
												{project.name}
											</span>
										</>
									)}
								</button>
								<span className="flex shrink-0 items-center pl-1">
									{status === "running" && (
										<>
											<button
												type="button"
												data-slot="restart-service"
												className={ACTION_CLASS}
												aria-label={`Restart ${service.label}`}
												title="Restart"
												onClick={() => onRestart(service.id)}
											>
												<ArrowPathIcon className="size-3.5" aria-hidden="true" />
											</button>
											<button
												type="button"
												data-slot="stop-service"
												className={ACTION_CLASS}
												aria-label={`Stop ${service.label}`}
												title="Stop"
												onClick={() => onStop(service.id)}
											>
												<StopIcon className="size-3.5" aria-hidden="true" />
											</button>
										</>
									)}
									{status !== "running" && (
										<button
											type="button"
											data-slot="start-service"
											className={ACTION_CLASS}
											aria-label={`Start ${service.label}`}
											title="Start"
											onClick={() => onStart(service.id)}
										>
											<PlayIcon className="size-3.5" aria-hidden="true" />
										</button>
									)}
									{armedId === service.id
										? (
											<button
												type="button"
												data-slot="confirm-delete-service"
												className={`${ACTION_CLASS} text-removed`}
												aria-label={`Confirm deleting ${service.label}`}
												onClick={() => {
													setArmedId(undefined);
													onRemove(service.id);
												}}
											>
												<CheckIcon className="size-3.5" aria-hidden="true" />
											</button>
										)
										: (
											<button
												type="button"
												data-slot="delete-service"
												className={`${ACTION_CLASS} hover:text-removed`}
												aria-label={`Delete ${service.label}`}
												title="Delete"
												onClick={() => setArmedId(service.id)}
											>
												<TrashIcon className="size-3.5" aria-hidden="true" />
											</button>
										)}
								</span>
							</div>
						);
					})}
				</nav>
			)}
		</section>
	);
}
