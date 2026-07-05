import type { Node } from "@xyflow/react";
import type { WorkspaceNode } from "@main/store/workspace";
import {
	DEFAULT_HEIGHT,
	DEFAULT_WIDTH,
	DRAG_HANDLE,
	FRAME_HEADER,
	FRAME_PADDING,
} from "./constants";

type SessionNodeData = { cwd: string; project?: string; alive: boolean };
export type SessionFlowNode = Node<SessionNodeData, "session">;
type FrameNodeData = { project: string };
export type FrameFlowNode = Node<FrameNodeData, "frame">;
export type FlowNode = SessionFlowNode | FrameFlowNode;
type LiveSession = { sessionId: string; cwd: string };

export function basename(path: string) {
	const trimmed = path.replace(/\/+$/, "");
	const name = trimmed.split("/").at(-1);

	if (!name) {
		return path;
	}

	return name;
}

export function nodeWidth(node: SessionFlowNode) {
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

type NodeSpec = {
	sessionId: string;
	cwd: string;
	project?: string;
	alive: boolean;
	position: { x: number; y: number };
	width: number;
	height: number;
};

function buildNode(
	existing: SessionFlowNode | undefined,
	spec: NodeSpec,
): SessionFlowNode {
	if (existing) {
		if (
			existing.data.alive === spec.alive &&
			existing.data.project === spec.project
		) {
			return existing;
		}

		return {
			...existing,
			data: { ...existing.data, alive: spec.alive, project: spec.project },
		};
	}

	return {
		id: spec.sessionId,
		type: "session",
		dragHandle: DRAG_HANDLE,
		position: spec.position,
		data: { cwd: spec.cwd, project: spec.project, alive: spec.alive },
		width: spec.width,
		height: spec.height,
	};
}

export function reconcile(
	current: SessionFlowNode[],
	sessions: LiveSession[],
	saved: WorkspaceNode[],
): SessionFlowNode[] {
	const byId = new Map(current.map((node) => [node.id, node]));
	const liveIds = new Set(sessions.map((s) => s.sessionId));
	const savedIds = new Set(saved.map((n) => n.sessionId));

	const savedNodes = saved.map((node) =>
		buildNode(byId.get(node.sessionId), {
			sessionId: node.sessionId,
			cwd: node.cwd,
			project: node.project,
			alive: liveIds.has(node.sessionId),
			position: { x: node.x, y: node.y },
			width: node.width,
			height: node.height,
		}),
	);

	let orphans = 0;
	const orphanNodes = sessions
		.filter((session) => !savedIds.has(session.sessionId))
		.map((session) => {
			const offset = orphans * 40;
			orphans += 1;

			return buildNode(byId.get(session.sessionId), {
				sessionId: session.sessionId,
				cwd: session.cwd,
				alive: true,
				position: { x: offset, y: offset },
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
			});
		});

	return [...savedNodes, ...orphanNodes];
}

export function computeFrames(nodes: SessionFlowNode[]): FrameFlowNode[] {
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
