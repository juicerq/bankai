import { type } from "arktype";
import { Store } from "@main/store/Store";

const nodeSchema = type({
	sessionId: "string > 0",
	cwd: "string > 0",
	project: "string > 0",
	x: "number",
	y: "number",
	width: "number",
	height: "number",
});

const viewportSchema = type({
	x: "number",
	y: "number",
	zoom: "number",
});

const workspaceContract = type({
	viewport: viewportSchema,
	nodes: nodeSchema.array(),
});

export type WorkspaceNode = typeof nodeSchema.infer;
export type Viewport = typeof viewportSchema.infer;
type WorkspaceValue = typeof workspaceContract.infer;

interface NodeUpdate
	extends Partial<Pick<WorkspaceNode, "x" | "y" | "width" | "height">> {
	sessionId: string;
}

const store = new Store({
	name: "workspace",
	version: 1,
	contract: workspaceContract,
	migrators: {},
	seed: (): WorkspaceValue => ({
		viewport: { x: 0, y: 0, zoom: 1 },
		nodes: [],
	}),
});

export const Workspace = {
	get: () => store.read(),
	addNode: (node: WorkspaceNode) =>
		store.mutate((current) => ({
			...current,
			nodes: current.nodes.some((n) => n.sessionId === node.sessionId)
				? current.nodes.map((n) =>
						n.sessionId === node.sessionId ? node : n,
					)
				: [...current.nodes, node],
		})),
	updateNode: (input: NodeUpdate) =>
		store.mutate((current) => ({
			...current,
			nodes: current.nodes.map((n) =>
				n.sessionId === input.sessionId ? { ...n, ...input } : n,
			),
		})),
	removeNode: (sessionId: string) =>
		store.mutate((current) => ({
			...current,
			nodes: current.nodes.filter((n) => n.sessionId !== sessionId),
		})),
	setViewport: (viewport: Viewport) =>
		store.mutate((current) => ({ ...current, viewport })),
};
