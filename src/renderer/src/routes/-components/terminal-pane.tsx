import { useTerminalSession } from "@renderer/routes/-utils/use-terminal-session";

export function TerminalPane({
	projectId,
	active,
	focusRequest,
	resizeDeferred,
}: {
	projectId: string;
	active: boolean;
	focusRequest: number;
	resizeDeferred: boolean;
}) {
	const { registerContainer, registerActivation, registerFocusRequest, registerResizeDeferral } = useTerminalSession(
		projectId,
		focusRequest,
		resizeDeferred,
	);

	return (
		<div className="size-full overflow-hidden bg-terminal-background pt-3 pr-0 pl-4">
			<div ref={registerContainer} className="size-full" />
			<span ref={registerResizeDeferral} hidden />
			{active && (
				<>
					<span ref={registerActivation} hidden />
					<span ref={registerFocusRequest} hidden />
				</>
			)}
		</div>
	);
}
