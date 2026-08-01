import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import type { ProjectCommand } from "@main/store/commands";
import type { Project } from "@main/store/projects";
import type { ServiceState, ServiceStatus } from "@shared/services";

const STATUS_DOT: Record<ServiceStatus, string> = {
	running: "bg-added",
	stopped: "bg-outline-strong",
	failed: "bg-removed",
};

const STATUS_ACTION: Record<ServiceStatus, string> = {
	running: "Stop",
	stopped: "Start",
	failed: "Start",
};

export function ServicesFooter({
	services,
	projects,
	open,
	states,
	openedCommandId,
	onToggle,
	onToggleService,
	onOpenLog,
}: {
	services: ProjectCommand[];
	projects: readonly Project[];
	open: boolean;
	states: ReadonlyMap<string, ServiceState>;
	openedCommandId: string | undefined;
	onToggle: () => void;
	onToggleService: (commandId: string) => void;
	onOpenLog: (projectId: string, commandId: string) => void;
}) {
	if (services.length === 0) {
		return null;
	}

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
								className={`group flex h-7 w-full items-center border-l-2 pr-3 ${
									service.id === openedCommandId ? "border-l-tertiary bg-surface-active" : "border-l-transparent"
								} hover:bg-surface-hover`}
							>
								<button
									type="button"
									data-slot="toggle-service"
									aria-label={`${STATUS_ACTION[status]} ${service.label}`}
									className="flex h-full shrink-0 items-center px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => onToggleService(service.id)}
								>
									<span
										data-slot="service-status"
										className={`size-[6px] rounded-full ${STATUS_DOT[status]} ${
											status === "running" ? "pending-pulse" : ""
										}`}
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									data-slot="open-service-log"
									aria-label={`Open ${service.label} output`}
									className="flex h-full min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
									onClick={() => onOpenLog(service.projectId, service.id)}
								>
									<span className="min-w-0 flex-1 truncate text-body text-secondary group-hover:text-primary">
										{service.label}
									</span>
									<span data-slot="service-detail" className="shrink-0 text-data text-outline-strong">
										{state?.pid && status === "running" ? state.pid : project?.name}
									</span>
								</button>
							</div>
						);
					})}
				</nav>
			)}
		</section>
	);
}
