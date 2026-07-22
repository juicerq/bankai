import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active }: { projectId: string; active: boolean }) {
	const { registerContainer, registerActivation } = useTerminalSession(projectId);

	return (
		<div className="size-full bg-terminal-background px-3 pt-3">
			<div ref={registerContainer} className="size-full" />
			{active && <span ref={registerActivation} hidden />}
		</div>
	);
}
