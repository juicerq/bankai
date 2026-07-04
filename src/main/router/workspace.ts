import { execFileSync } from "node:child_process";
import { type } from "arktype";
import { base } from "@main/router/_base";
import { Workspace } from "@main/store/workspace";

function projectOf(cwd: string): string {
	try {
		return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
			encoding: "utf8",
		}).trim();
	} catch {
		return cwd;
	}
}

export const workspaceRouter = {
	get: base.handler(() => Workspace.get()),
	addNode: base
		.input(
			type({
				sessionId: "string > 0",
				cwd: "string > 0",
				x: "number",
				y: "number",
				width: "number",
				height: "number",
			}),
		)
		.handler(({ input }) =>
			Workspace.addNode({ ...input, project: projectOf(input.cwd) }),
		),
	updateNode: base
		.input(
			type({
				sessionId: "string > 0",
				"x?": "number",
				"y?": "number",
				"width?": "number",
				"height?": "number",
			}),
		)
		.handler(({ input }) => Workspace.updateNode(input)),
	removeNode: base
		.input(type({ sessionId: "string > 0" }))
		.handler(async ({ input }) => {
			await Workspace.removeNode(input.sessionId);
			return null;
		}),
	setViewport: base
		.input(type({ x: "number", y: "number", zoom: "number" }))
		.handler(({ input }) => Workspace.setViewport(input)),
};
