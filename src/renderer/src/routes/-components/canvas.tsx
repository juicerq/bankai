import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Background,
	BackgroundVariant,
	Controls,
	type NodeChange,
	type OnMoveEnd,
	type OnNodeDrag,
	type OnNodesChange,
	ReactFlow,
	useKeyPress,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import { useRef, useState } from "react";
import { client, orpc } from "@renderer/lib/api";
import { DEFAULT_HEIGHT, DEFAULT_WIDTH } from "../-utils/constants";
import {
	computeFrames,
	type FlowNode,
	reconcile,
	type SessionFlowNode,
} from "../-utils/flow-nodes";
import { ResizeProvider } from "../-utils/resize-context";
import { SettledZoomContext } from "../-utils/settled-zoom-context";
import { CanvasToolbar } from "./canvas-toolbar";
import { FrameNode } from "./frame-node";
import { SessionNode } from "./session-node";

const nodeTypes = { session: SessionNode, frame: FrameNode };

export function Canvas() {
	const queryClient = useQueryClient();
	const rf = useReactFlow<FlowNode>();
	const paneRef = useRef<HTMLDivElement>(null);

	const list = useQuery(orpc.sessions.list.queryOptions());
	const workspace = useQuery(orpc.workspace.get.queryOptions());

	const altKey = useKeyPress("Alt");
	const [resizingId, setResizingId] = useState<string | null>(null);

	const beginResize = (nodeId: string) => setResizingId(nodeId);
	const endResize = (_nodeId: string) => setResizingId(null);

	const [nodes, setNodes, onNodesChange] = useNodesState<SessionFlowNode>([]);
	const [synced, setSynced] = useState<{
		list: typeof list.data;
		workspace: typeof workspace.data;
	}>({ list: undefined, workspace: undefined });
	const [creating, setCreating] = useState(false);
	const [settledZoom, setSettledZoom] = useState<number | null>(null);

	if (
		workspace.data &&
		(list.data !== synced.list || workspace.data !== synced.workspace)
	) {
		setSynced({ list: list.data, workspace: workspace.data });
		setNodes((current) =>
			reconcile(current, list.data ?? [], workspace.data.nodes),
		);
	}

	const onNewSession = async () => {
		if (creating) {
			return;
		}

		setCreating(true);

		try {
			const cwd = await client.sessions.pickCwd();

			if (!cwd) {
				return;
			}

			const { sessionId } = await client.sessions.create({ cwd });
			const rect = paneRef.current?.getBoundingClientRect();
			const center = rect
				? rf.screenToFlowPosition({
						x: rect.left + rect.width / 2,
						y: rect.top + rect.height / 2,
					})
				: { x: 0, y: 0 };

			await client.workspace.addNode({
				sessionId,
				cwd,
				x: center.x - DEFAULT_WIDTH / 2,
				y: center.y - DEFAULT_HEIGHT / 2,
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
			});
			await queryClient.invalidateQueries({
				queryKey: orpc.workspace.get.key(),
			});
			queryClient.invalidateQueries({ queryKey: orpc.sessions.list.key() });
		} finally {
			setCreating(false);
		}
	};

	const onNodesChangeFlow: OnNodesChange<FlowNode> = (changes) => {
		const sessionChanges = changes.filter(
			(change) => !("id" in change) || !change.id.startsWith("frame:"),
		) as NodeChange<SessionFlowNode>[];

		onNodesChange(sessionChanges);
	};

	const onNodeDragStop: OnNodeDrag<FlowNode> = (_e, node) => {
		if (node.type !== "session") {
			return;
		}

		client.workspace.updateNode({
			sessionId: node.id,
			x: node.position.x,
			y: node.position.y,
		});
	};

	const onMoveEnd: OnMoveEnd = (_e, viewport) => {
		client.workspace.setViewport(viewport);
		setSettledZoom(viewport.zoom);
	};

	if (!workspace.data) {
		return <div className="h-screen w-screen" />;
	}

	const flowNodes: FlowNode[] = [...computeFrames(nodes), ...nodes];

	return (
		<div ref={paneRef} className="h-screen w-screen">
			<ResizeProvider
				altKey={altKey}
				resizingId={resizingId}
				beginResize={beginResize}
				endResize={endResize}
			>
				<SettledZoomContext.Provider
					value={settledZoom ?? workspace.data.viewport.zoom}
				>
					<ReactFlow<FlowNode>
				nodes={flowNodes}
				onNodesChange={onNodesChangeFlow}
				nodeTypes={nodeTypes}
				defaultViewport={workspace.data.viewport}
			minZoom={0.3}
			maxZoom={1}
			colorMode="light"
			zoomOnScroll={false}
			zoomOnPinch
			panOnScroll={false}
			deleteKeyCode={null}
onNodeDragStop={onNodeDragStop}
		onMoveEnd={onMoveEnd}
			proOptions={{ hideAttribution: true }}
			>
				<Background
					variant={BackgroundVariant.Dots}
					gap={22}
					size={1.4}
					color="#c9bf9b"
				/>

				<Controls showInteractive={false} />

				<CanvasToolbar onNewSession={onNewSession} creating={creating} />

				{nodes.length === 0 && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<p className="font-mono text-sm text-ink-muted">
							Nenhuma sessão. Clique em Nova sessão.
						</p>
					</div>
				)}
			</ReactFlow>
				</SettledZoomContext.Provider>
			</ResizeProvider>
		</div>
	);
}
