import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({
	projectId,
	active,
	focusRequest,
}: {
	projectId: string;
	active: boolean;
	focusRequest: number;
}) {
	const { registerContainer, registerActivation, registerFocusRequest } = useTerminalSession(projectId, focusRequest);

	return (
		<div className="size-full bg-terminal-background pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="size-full" />
			{active && (
				<>
					<span ref={registerActivation} hidden />
					<span ref={registerFocusRequest} hidden />
				</>
			)}
		</div>
	);
}
