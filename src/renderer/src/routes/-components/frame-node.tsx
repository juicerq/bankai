import { useQueryClient } from "@tanstack/react-query";
import { type NodeProps, useReactFlow } from "@xyflow/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { client, orpc } from "@renderer/lib/api";
import { CLUSTER_GAP, DEFAULT_HEIGHT, DEFAULT_WIDTH } from "../-utils/constants";
import {
	basename,
	type FlowNode,
	type FrameFlowNode,
	nodeWidth,
	type SessionFlowNode,
} from "../-utils/flow-nodes";

export function FrameNode({ data }: NodeProps<FrameFlowNode>) {
	const queryClient = useQueryClient();
	const rf = useReactFlow<FlowNode>();
	const [adding, setAdding] = useState(false);

	const onAdd = async () => {
		if (adding) {
			return;
		}

		setAdding(true);

		try {
			const cluster = rf
				.getNodes()
				.filter(
					(n): n is SessionFlowNode =>
						n.type === "session" && n.data.project === data.project,
				);

			const x = cluster.length
				? Math.max(...cluster.map((n) => n.position.x + nodeWidth(n))) +
					CLUSTER_GAP
				: 0;
			const y = cluster.length
				? Math.min(...cluster.map((n) => n.position.y))
				: 0;

			const { sessionId } = await client.sessions.create({ cwd: data.project });

			await client.workspace.addNode({
				sessionId,
				cwd: data.project,
				x,
				y,
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
			});
			await queryClient.invalidateQueries({
				queryKey: orpc.workspace.get.key(),
			});
			queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
		} finally {
			setAdding(false);
		}
	};

	return (
		<div className="pointer-events-none h-full w-full rounded-2xl border border-ink/10 bg-ink/[0.02]">
			<div className="pointer-events-auto absolute top-1.5 left-3 flex items-center gap-2">
<span className="px-1 font-mono text-[11px] font-semibold tracking-wide text-ink-muted">
				{basename(data.project)}
			</span>

				<button
					type="button"
					onClick={onAdd}
					disabled={adding}
					title="Nova sessão neste projeto"
					className="flex h-6 w-6 items-center justify-center rounded-lg bg-paper/60 font-mono text-sm text-ink transition-colors hover:bg-slime hover:text-paper focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:opacity-50"
				>
					<Plus size={14} strokeWidth={2} />
				</button>
			</div>
		</div>
	);
}
