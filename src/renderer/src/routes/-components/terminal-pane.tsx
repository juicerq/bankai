import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({ projectId, active }: { projectId: string; active: boolean }) {
	const { registerContainer, registerActivation } = useTerminalSession(projectId);

	return (
		<div className="size-full bg-terminal-background pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="size-full" />
			{active && <span ref={registerActivation} hidden />}
		</div>
	);
}
