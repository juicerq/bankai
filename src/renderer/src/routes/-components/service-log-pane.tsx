import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ServiceStatus } from "@shared/services";
import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function ServiceLogPane({
	projectId,
	commandId,
	label,
	status,
	resizeDeferred,
	onClose,
}: {
	projectId: string;
	commandId: string;
	label: string;
	status: ServiceStatus;
	resizeDeferred: boolean;
	onClose: () => void;
}) {
	return (
		<section
			data-component="service-log"
			data-command-id={commandId}
			data-status={status}
			aria-label={`${label} output`}
			className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-terminal-background"
		>
			<div className="flex h-7 shrink-0 items-center gap-2 border-outline border-b bg-surface-raised pr-1 pl-3">
				<span className="text-label text-secondary">SERVICE OUTPUT</span>
				<span className="min-w-0 truncate text-body text-primary">{label}</span>
				<span className="ml-auto shrink-0 text-label text-outline-strong">READ ONLY</span>
				<button
					type="button"
					data-slot="close-service-log"
					aria-label={`Close ${label} output`}
					className="shrink-0 px-2 py-1 text-tertiary hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
					onClick={onClose}
				>
					<XMarkIcon className="size-3.5" aria-hidden="true" />
				</button>
			</div>
			{status === "running"
				? <ServiceLogTerminal key={commandId} projectId={projectId} commandId={commandId} resizeDeferred={resizeDeferred} />
				: (
					<p data-slot="service-stopped" className="px-4 py-3 text-data text-secondary">
						This service is not running. Start it to read its output.
					</p>
				)}
		</section>
	);
}

function ServiceLogTerminal({
	projectId,
	commandId,
	resizeDeferred,
}: {
	projectId: string;
	commandId: string;
	resizeDeferred: boolean;
}) {
	const { registerContainer, registerResizeDeferral } = useTerminalSession({
		projectId,
		shellId: commandId,
		focusRequest: 0,
		resizeDeferred,
		resumeOnMount: false,
		attachOnly: true,
	});

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="min-h-0 flex-1" />
			<span ref={registerResizeDeferral} hidden />
		</div>
	);
}
