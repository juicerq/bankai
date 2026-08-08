import { XMarkIcon } from "@heroicons/react/24/outline";
import type { ServiceStatus } from "@shared/services";
import { useTerminalReplay } from "@renderer/routes/-features/services/use-terminal-replay";
import { useTerminalSession } from "@renderer/routes/-features/terminal/use-terminal-session";

export function ServiceLogPane({
	projectId,
	commandId,
	label,
	status,
	output,
	outputPending,
	resizeDeferred,
	onClose,
}: {
	projectId: string;
	commandId: string;
	label: string;
	status: ServiceStatus;
	output?: string;
	outputPending?: boolean;
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
				: <ServiceLogRetained key={commandId} output={output} pending={outputPending === true} />}
		</section>
	);
}

function ServiceLogRetained({ output, pending }: { output: string | undefined; pending: boolean }) {
	if (output) {
		return <ServiceLogReplay output={output} />;
	}

	if (pending) {
		return null;
	}

	return (
		<p data-slot="service-no-output" className="px-4 py-3 text-data text-secondary">
			This service has no output yet. Start it to read its output.
		</p>
	);
}

function ServiceLogReplay({ output }: { output: string }) {
	const registerContainer = useTerminalReplay(output);

	return (
		<div data-slot="service-retained-output" className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="min-h-0 flex-1" />
		</div>
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
		resizeDeferred,
		attachOnly: true,
	});

	return (
		<div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="min-h-0 flex-1" />
			<span ref={registerResizeDeferral} hidden />
		</div>
	);
}
