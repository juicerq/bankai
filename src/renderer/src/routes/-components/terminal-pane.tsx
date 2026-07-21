import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId }: { projectId: string }) {
	const containerRef = useTerminalSession(projectId);

	return <div ref={containerRef} className="size-full p-3" />;
}
