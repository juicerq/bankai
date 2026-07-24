import { type } from "arktype";
import { base } from "@main/router/_base";
import { Continuity } from "@main/store/continuity";

const shellInput = type({ id: "string", label: "string" });

export const continuityRouter = {
	get: base.handler(() => Continuity.load()),
	activateProject: base.input(type({ projectId: "string" })).handler(({ input }) => Continuity.activateProject(input.projectId)),
	openShell: base
		.input(type({ projectId: "string", shell: shellInput }))
		.handler(({ input }) => Continuity.openShell(input)),
	closeShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.closeShell(input)),
	moveShell: base
		.input(type({ projectId: "string", shellId: "string", toIndex: "number" }))
		.handler(({ input }) => Continuity.moveShell(input)),
	selectShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.selectShell(input)),
};
