import type { Node } from "@xyflow/react";
import type { WorkspaceNode } from "@main/store/workspace";
import {
	DEFAULT_HEIGHT,
	DEFAULT_WIDTH,
	DRAG_HANDLE,
	FRAME_HEADER,
	FRAME_PADDING,
} from "./constants";

type SessionNodeData = { cwd: string; project?: string };
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

export function reconcile(
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
