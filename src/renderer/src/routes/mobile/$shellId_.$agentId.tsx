import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MobileConversation } from "@renderer/routes/mobile/-components/mobile-conversation";
import { useConversation } from "@renderer/routes/mobile/-utils/use-conversation";

export const Route = createFileRoute("/mobile/$shellId_/$agentId")({ component: MobileSubagentRoute });

function MobileSubagentRoute() {
	const { shellId, agentId } = Route.useParams();
	const navigate = useNavigate();
	const conversation = useConversation(shellId, agentId);

	return (
		<MobileConversation
			shellId={shellId}
			session={undefined}
			agent="Subagent"
			conversation={conversation}
			onBack={() => navigate({ to: "/mobile/$shellId", params: { shellId } })}
		/>
	);
}
