import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active }: { projectId: string; active: boolean }) {
	const containerRef = useTerminalSession(projectId, active);

	return (
		<div className="size-full bg-terminal-background px-3 pt-3">
			<div ref={containerRef} className="size-full" />
		</div>
	);
}
