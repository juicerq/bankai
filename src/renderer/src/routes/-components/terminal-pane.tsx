import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active }: { projectId: string; active: boolean }) {
	const containerRef = useTerminalSession(projectId, active);

	return <div ref={containerRef} className="size-full p-3" />;
}
