import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active, resizing }: { projectId: string; active: boolean; resizing: boolean }) {
	const containerRef = useTerminalSession(projectId, active, resizing);

	return (
		<div className="size-full bg-terminal-background px-3 pt-3">
			<div ref={containerRef} className="size-full" />
		</div>
	);
}
