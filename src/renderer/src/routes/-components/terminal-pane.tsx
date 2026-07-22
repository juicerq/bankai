import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({
	projectId,
	active,
	warm,
}: {
	projectId: string;
	active: boolean;
	warm: boolean;
}) {
	const { registerContainer, registerWarmth, registerActivation } = useTerminalSession(projectId);

	return (
		<div className="size-full bg-terminal-background px-3 pt-3">
			<div ref={registerContainer} className="size-full" />
			{warm && <span ref={registerWarmth} hidden />}
			{active && <span ref={registerActivation} hidden />}
		</div>
	);
}
