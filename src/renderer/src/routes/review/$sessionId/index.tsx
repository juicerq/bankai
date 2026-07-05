import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type } from "arktype";
import { ArrowLeft, FileQuestion, ScrollText } from "lucide-react";
import { orpc } from "@renderer/lib/api";
import { ReviewComponents as Components } from "./-components";
import { ReviewProvider } from "./-utils/review-context";

// ROUTE

export const Route = createFileRoute("/review/$sessionId/")({
	component: ReviewPage,
	params: type({ sessionId: "string > 0" }),
});

// ROUTE MAIN COMPONENT

function ReviewPage() {
	const { sessionId } = Route.useParams();

	const { data: turns } = useQuery(
		orpc.review.getTurns.queryOptions({
			input: { sessionId },
			placeholderData: keepPreviousData,
		}),
	);
	const { data: sessions } = useQuery(orpc.sessions.list.queryOptions());

	if (!turns || !sessions) {
		return <div className="h-screen w-screen" />;
	}

	const session = sessions.find((s) => s.sessionId === sessionId);

	if (!session && turns.length === 0) {
		return (
			<div className="flex h-screen w-screen flex-col">
				<Components.Message
					icon={FileQuestion}
					title="sessão não encontrada"
					subtitle="essa sessão não existe ou já foi encerrada"
				>
					<Link
						to="/"
						className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 font-mono text-[12px] text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
					>
						<ArrowLeft size={14} strokeWidth={1.75} />
						voltar ao canvas
					</Link>
				</Components.Message>
			</div>
		);
	}

	const cwd = session?.cwd ?? sessionId;

	return (
		<div className="flex h-screen w-screen flex-col">
			<Components.Topbar cwd={cwd} />

			{turns.length === 0 && (
				<Components.Message
					icon={ScrollText}
					title="nenhum turno pra revisar ainda"
					subtitle="os turnos aparecem conforme o agente trabalha"
				/>
			)}
			{turns.length > 0 && (
				<ReviewProvider sessionId={sessionId} turns={turns} cwd={cwd}>
					<Components.Layout />
				</ReviewProvider>
			)}
		</div>
	);
}
