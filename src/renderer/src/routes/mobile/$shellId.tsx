import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { terminalStream } from "@renderer/lib/stream/terminal";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import { useConversation } from "@renderer/routes/mobile/-utils/use-conversation";
import { useShellFocus } from "@renderer/routes/-utils/use-shell-focus";
import { useMobileSurface } from "@renderer/routes/mobile/-utils/mobile-surface-context";

export const Route = createFileRoute("/mobile/$shellId")({ component: MobileConversationRoute });

function MobileConversationRoute() {
	const { shellId } = Route.useParams();
	const { rows } = useMobileSurface();
	const navigate = useNavigate();
	const row = rows.find((entry) => entry.shellId === shellId);
	const conversation = useConversation(shellId);

	useShellFocus(shellId);

	return (
		<MobileConversation
			shellId={shellId}
			row={row}
			conversation={conversation}
			onBack={() => navigate({ to: "/mobile" })}
			onSend={async (text) => {
				if (!row) {
					throw new Error("This session is no longer open");
				}

				await terminalStream.prompt(row.projectId, shellId, text);
			}}
			onKey={async (key) => {
				if (!row) {
					throw new Error("This session is no longer open");
				}

				await terminalStream.key(row.projectId, shellId, key);
			}}
		/>
	);
}
