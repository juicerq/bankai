import { useQueryClient } from "@tanstack/react-query";
import {
	type NodeProps,
	NodeResizer,
	type OnResizeEnd,
} from "@xyflow/react";
import { useContext } from "react";
import { Terminal } from "@renderer/components/terminal";
import { client, orpc } from "@renderer/lib/api";
import { basename, type SessionFlowNode } from "../-utils/flow-nodes";
import { useResizing } from "../-utils/resize-context";
import { SettledZoomContext } from "../-utils/settled-zoom-context";

export function SessionNode({ id, data }: NodeProps<SessionFlowNode>) {
	const queryClient = useQueryClient();
	const { resizing, ctx } = useResizing(id);
	const zoom = useContext(SettledZoomContext);

	const invalidateList = () => {
		queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
	};

	const onKill = async () => {
		await client.sessions.kill({ sessionId: id });
		await client.workspace.removeNode({ sessionId: id });
		invalidateList();
	};

	const onResizeEnd: OnResizeEnd = (_e, params) => {
		ctx.endResize(id);
		client.workspace.updateNode({
			sessionId: id,
			x: params.x,
			y: params.y,
			width: params.width,
			height: params.height,
		});
	};

	return (
		<div className="flex h-full w-full flex-col rounded-xl border border-ink/10 bg-panel shadow-lg shadow-ink/10">
			<NodeResizer
				minWidth={320}
				minHeight={240}
				color="#6b9233"
				isVisible={resizing}
				onResizeStart={(_e) => ctx.beginResize(id)}
				onResizeEnd={onResizeEnd}
			/>

			<header className="session-drag-handle flex cursor-grab items-center justify-between gap-3 rounded-t-xl bg-panel px-4 py-2.5 active:cursor-grabbing">
				<div className="min-w-0">
					<h2 className="truncate text-base font-semibold text-ink">
						{basename(data.cwd)}
					</h2>
					<p className="truncate font-mono text-[11px] text-ink-muted">
						{data.cwd}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<span className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-ink-muted">
						<span className="h-2 w-2 rounded-full bg-slime" />
						idle
					</span>

					<button
						type="button"
						disabled
						title="em breve"
						className="nodrag rounded-lg px-2.5 py-1 font-mono text-xs text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
					>
						Ver diff
					</button>

					<button
						type="button"
						onClick={onKill}
						className="nodrag rounded-lg px-2.5 py-1 font-mono text-xs text-ink-muted transition-colors hover:bg-danger hover:text-paper focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
					>
						encerrar
					</button>
				</div>
			</header>

			<div className="nodrag nopan nowheel min-h-0 flex-1 overflow-hidden rounded-b-xl border-t border-ink/10 bg-paper p-2">
				<Terminal sessionId={id} zoom={zoom} onExit={invalidateList} />
			</div>
		</div>
	);
}
