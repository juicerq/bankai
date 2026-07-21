import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active, resizing }: { projectId: string; active: boolean; resizing: boolean }) {
	const containerRef = useTerminalSession(projectId, active, resizing);

	return <div ref={containerRef} className="size-full p-3" />;
}
