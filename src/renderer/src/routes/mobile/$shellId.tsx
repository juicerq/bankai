import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { terminalStream } from "@renderer/lib/stream/terminal";
import { useDesktopOnlyHarness } from "@renderer/routes/-features/sessions/lifecycle/use-harness-conversation";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import { useConversation } from "@renderer/routes/mobile/-utils/use-conversation";
import { useShellFocus } from "@renderer/routes/-features/sessions/lifecycle/use-shell-focus";
import { useMobileSurface } from "@renderer/routes/mobile/-utils/mobile-surface-context";

export const Route = createFileRoute("/mobile/$shellId")({ component: MobileConversationRoute });

function MobileConversationRoute() {
	const { shellId } = Route.useParams();
	const { rows } = useMobileSurface();
	const navigate = useNavigate();
	const row = rows.find((entry) => entry.shellId === shellId);
	const conversation = useConversation(shellId);
	const desktopOnly = useDesktopOnlyHarness(row?.harness);

	useShellFocus(shellId);

	return (
		<MobileConversation
			shellId={shellId}
			session={row && {
				row,
				onSend: (text) => terminalStream.prompt(row.projectId, shellId, text),
				onKey: (key) => terminalStream.key(row.projectId, shellId, key),
			}}
			conversation={conversation}
			desktopOnly={desktopOnly}
			onOpenAgent={(toolUseId) =>
				navigate({ to: "/mobile/$shellId/$agentId", params: { shellId, agentId: toolUseId } })
			}
			onBack={() => navigate({ to: "/mobile" })}
		/>
	);
}
