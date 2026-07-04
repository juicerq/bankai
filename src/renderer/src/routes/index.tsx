import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Background,
	BackgroundVariant,
	Controls,
	type Node,
	type NodeChange,
	NodeResizer,
	type NodeProps,
	type OnMoveEnd,
	type OnNodeDrag,
	type OnNodesChange,
	type OnResizeEnd,
	Panel,
	ReactFlow,
	ReactFlowProvider,
	useKeyPress,
	useNodesState,
	useReactFlow,
} from "@xyflow/react";
import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { WorkspaceNode } from "@main/store/workspace";
import { Terminal } from "@renderer/components/Terminal";
import { client, orpc } from "@renderer/lib/api";

export const Route = createFileRoute("/")({
	component: SessionsPage,
});

const DEFAULT_WIDTH = 560;
const DEFAULT_HEIGHT = 420;
const DRAG_HANDLE = ".session-drag-handle";
const FRAME_PADDING = 24;
const FRAME_HEADER = 40;
const CLUSTER_GAP = 48;

type SessionNodeData = { cwd: string; project?: string };
type SessionFlowNode = Node<SessionNodeData, "session">;
type FrameNodeData = { project: string };
type FrameFlowNode = Node<FrameNodeData, "frame">;
type FlowNode = SessionFlowNode | FrameFlowNode;
type LiveSession = { sessionId: string; cwd: string };

function basename(path: string) {
	const trimmed = path.replace(/\/+$/, "");
	const name = trimmed.split("/").at(-1);

	if (!name) {
		return path;
	}

	return name;
}

function nodeWidth(node: SessionFlowNode) {
	if (node.width !== undefined) {
		return node.width;
	}

	if (node.measured?.width !== undefined) {
		return node.measured.width;
	}

	return DEFAULT_WIDTH;
}

function nodeHeight(node: SessionFlowNode) {
	if (node.height !== undefined) {
		return node.height;
	}

	if (node.measured?.height !== undefined) {
		return node.measured.height;
	}

	return DEFAULT_HEIGHT;
}

function reconcile(
	current: SessionFlowNode[],
	sessions: LiveSession[],
	saved: WorkspaceNode[],
): SessionFlowNode[] {
	const byId = new Map(current.map((node) => [node.id, node]));
	let orphans = 0;

	return sessions.map((session) => {
		const savedNode = saved.find((node) => node.sessionId === session.sessionId);
		const existing = byId.get(session.sessionId);

		if (existing) {
			const project = savedNode?.project ?? existing.data.project;

			if (project === existing.data.project) {
				return existing;
			}

			return { ...existing, data: { ...existing.data, project } };
		}

		const offset = orphans * 40;

		if (!savedNode) {
			orphans += 1;
		}

		return {
			id: session.sessionId,
			type: "session",
			dragHandle: DRAG_HANDLE,
			position: savedNode
				? { x: savedNode.x, y: savedNode.y }
				: { x: offset, y: offset },
			data: { cwd: session.cwd, project: savedNode?.project },
			width: savedNode?.width ?? DEFAULT_WIDTH,
			height: savedNode?.height ?? DEFAULT_HEIGHT,
		};
	});
}

function computeFrames(nodes: SessionFlowNode[]): FrameFlowNode[] {
	const groups = new Map<string, SessionFlowNode[]>();

	for (const node of nodes) {
		if (!node.data.project) {
			continue;
		}

		const members = groups.get(node.data.project) ?? [];
		members.push(node);
		groups.set(node.data.project, members);
	}

	return [...groups].map(([project, members]) => {
		const left = Math.min(...members.map((n) => n.position.x));
		const top = Math.min(...members.map((n) => n.position.y));
		const right = Math.max(...members.map((n) => n.position.x + nodeWidth(n)));
		const bottom = Math.max(...members.map((n) => n.position.y + nodeHeight(n)));

		return {
			id: `frame:${project}`,
			type: "frame",
			position: {
				x: left - FRAME_PADDING,
				y: top - FRAME_PADDING - FRAME_HEADER,
			},
			width: right - left + FRAME_PADDING * 2,
			height: bottom - top + FRAME_PADDING * 2 + FRAME_HEADER,
			draggable: false,
			selectable: false,
			focusable: false,
			deletable: false,
			zIndex: 0,
			data: { project },
		};
	});
}

function FrameNode({ data }: NodeProps<FrameFlowNode>) {
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
		<div className="pointer-events-none h-full w-full rounded-lg border-[1.5px] border-dashed border-highlight">
			<div className="pointer-events-auto absolute top-1.5 left-3 flex items-center gap-2">
<span className="rounded-sm border border-highlight bg-panel px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-ink-muted">
				{basename(data.project)}
			</span>

				<button
					type="button"
					onClick={onAdd}
					disabled={adding}
					title="Nova sessão neste projeto"
					className="flex h-6 w-6 items-center justify-center rounded-sm border border-highlight bg-paper font-mono text-sm text-ink transition-colors hover:bg-slime hover:text-paper focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:opacity-50"
				>
					+
				</button>
			</div>
		</div>
	);
}

function SessionNode({ id, data }: NodeProps<SessionFlowNode>) {
	const queryClient = useQueryClient();
	const { resizing, ctx } = useResizing(id);

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
		<div className="flex h-full w-full flex-col rounded-sm border border-highlight bg-panel shadow-[0_6px_20px_-8px_rgba(51,48,42,0.35)]">
			<NodeResizer
				minWidth={320}
				minHeight={240}
				color="#6b9233"
				isVisible={resizing}
				onResizeStart={(_e) => ctx.beginResize(id)}
				onResizeEnd={onResizeEnd}
			/>

			<header className="session-drag-handle flex cursor-grab items-center justify-between gap-3 rounded-t-sm bg-panel px-4 py-2.5 active:cursor-grabbing">
				<div className="min-w-0">
					<h2 className="truncate text-base font-semibold text-ink">
						{basename(data.cwd)}
					</h2>
					<p className="truncate font-mono text-[11px] text-ink-muted">
						{data.cwd}
					</p>
				</div>

				<div className="flex shrink-0 items-center gap-2">
					<span className="rounded-full border border-highlight bg-paper px-2 py-0.5 font-mono text-[10px] tracking-wide text-ink-muted">
						idle
					</span>

					<button
						type="button"
						disabled
						title="em breve"
						className="nodrag rounded-sm px-2.5 py-1 font-mono text-xs text-ink-muted disabled:cursor-not-allowed disabled:opacity-40"
					>
						Ver diff
					</button>

					<button
						type="button"
						onClick={onKill}
						className="nodrag rounded-sm px-2.5 py-1 font-mono text-xs text-ink-muted transition-colors hover:bg-danger hover:text-paper focus-visible:ring-2 focus-visible:ring-danger focus-visible:outline-none"
					>
						encerrar
					</button>
				</div>
			</header>

			<div className="nodrag nopan nowheel min-h-0 flex-1 overflow-hidden rounded-b-sm border-t border-highlight bg-paper p-2">
				<Terminal sessionId={id} onExit={invalidateList} />
			</div>
		</div>
	);
}

type ResizeState = {
	resizingFor: string | null;
	beginResize: (nodeId: string) => void;
	endResize: (nodeId: string) => void;
};

const ResizeContext = createContext<ResizeState>({
	resizingFor: null,
	beginResize: () => {},
	endResize: () => {},
});

const useResizing = (nodeId: string) => {
	const ctx = useContext(ResizeContext);
	return { resizing: ctx.resizingFor === nodeId, ctx };
};

function ResizeProvider({
	altKey,
	hoveredId,
	resizingId,
	beginResize,
	endResize,
	children,
}: {
	altKey: boolean;
	hoveredId: string | null;
	resizingId: string | null;
	beginResize: (nodeId: string) => void;
	endResize: (nodeId: string) => void;
	children: ReactNode;
}) {
	const resizingFor = resizingId ?? (altKey ? hoveredId : null);
	return (
		<ResizeContext.Provider value={{ resizingFor, beginResize, endResize }}>
			{children}
		</ResizeContext.Provider>
	);
}

const nodeTypes = { session: SessionNode, frame: FrameNode };

function Canvas() {
	const queryClient = useQueryClient();
	const rf = useReactFlow<FlowNode>();
	const paneRef = useRef<HTMLDivElement>(null);

	const list = useQuery(orpc.sessions.list.queryOptions());
	const workspace = useQuery(orpc.workspace.get.queryOptions());

	const altKey = useKeyPress("Alt");
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [resizingId, setResizingId] = useState<string | null>(null);

	const beginResize = (nodeId: string) => setResizingId(nodeId);
	const endResize = (_nodeId: string) => setResizingId(null);

	const [nodes, setNodes, onNodesChange] = useNodesState<SessionFlowNode>([]);
	const [synced, setSynced] = useState<{
		list: typeof list.data;
		workspace: typeof workspace.data;
	}>({ list: undefined, workspace: undefined });
	const [creating, setCreating] = useState(false);

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
	};

	if (!workspace.data) {
		return <div className="h-screen w-screen" />;
	}

	const flowNodes: FlowNode[] = [...computeFrames(nodes), ...nodes];

	return (
		<div ref={paneRef} className="h-screen w-screen">
			<ResizeProvider
				altKey={altKey}
				hoveredId={hoveredId}
				resizingId={resizingId}
				beginResize={beginResize}
				endResize={endResize}
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
onNodeDragStop={onNodeDragStop}
			onNodeMouseEnter={(_e, node) => setHoveredId(node.id)}
			onNodeMouseLeave={() => setHoveredId(null)}
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

				<Panel
					position="top-left"
					className="flex items-center gap-2 rounded-sm border border-highlight bg-panel/80 p-2 shadow-[0_2px_0_var(--color-highlight)] backdrop-blur"
				>
					<button
						type="button"
						onClick={onNewSession}
						disabled={creating}
						className="rounded-sm bg-slime px-4 py-2 font-mono text-sm text-paper shadow-[0_2px_0_var(--color-olive)] transition-colors hover:bg-olive focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none disabled:opacity-60"
					>
						Nova sessão
					</button>

					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => rf.zoomOut()}
							aria-label="Diminuir zoom"
							className="h-8 w-8 rounded-sm border border-highlight bg-paper font-mono text-sm text-ink transition-colors hover:bg-highlight focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
						>
							-
						</button>
						<button
							type="button"
							onClick={() => rf.zoomIn()}
							aria-label="Aumentar zoom"
							className="h-8 w-8 rounded-sm border border-highlight bg-paper font-mono text-sm text-ink transition-colors hover:bg-highlight focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
						>
							+
						</button>
						<button
							type="button"
							onClick={() => rf.fitView({ padding: 0.2, duration: 200 })}
							className="h-8 rounded-sm border border-highlight bg-paper px-2.5 font-mono text-xs text-ink transition-colors hover:bg-highlight focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
						>
							ajustar
						</button>
					</div>
				</Panel>

				{nodes.length === 0 && (
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						<p className="font-mono text-sm text-ink-muted">
							Nenhuma sessão. Clique em Nova sessão.
						</p>
					</div>
				)}
			</ReactFlow>
			</ResizeProvider>
		</div>
	);
}

function SessionsPage() {
	return (
		<ReactFlowProvider>
			<Canvas />
		</ReactFlowProvider>
	);
}
