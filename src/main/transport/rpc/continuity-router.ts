import { AgentActivity } from "@main/agents/agent-activity";
import { ShellFacts } from "@main/agents/session/shell-facts";
import { GitProcess } from "@main/git/git-process";
import { Logger } from "@main/infra/logger";
import { base } from "@main/transport/rpc/rpc-base";
import { Continuity, type ContinuityValue } from "@main/store/continuity";
import { shellProcesses } from "@main/terminal/shell-processes";
import { type } from "arktype";

const shellInput = type({
	id: "string",
	"plain?": "boolean",
	"launch?": "string",
	"title?": "string",
	"titleSource?": "'user' | 'harness'",
});

async function stamped(
	input: { projectId: string; shellId: string },
	fallback: ContinuityValue,
): Promise<ContinuityValue> {
	return await ShellFacts.stamp(input).catch((err) => {
		Logger.error("continuity:stamp-failed", { ...input, err: String(err) });
		return fallback;
	});
}

export const continuityRouter = {
	get: base.handler(() => Continuity.load()),
	openShell: base
		.input(type({ projectId: "string", shell: shellInput }))
		.handler(async ({ input }) => {
			const opened = await Continuity.openShell(input);

			return await stamped(
				{ projectId: input.projectId, shellId: input.shell.id },
				opened,
			);
		}),
	closeShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => {
			GitProcess.forgetTurn(input.shellId).catch((err) =>
				Logger.error("review:forget-turn-failed", {
					shellId: input.shellId,
					err: String(err),
				}),
			);
			shellProcesses.closeShell(input);

			return Continuity.closeShell(input);
		}),
	renameShell: base
		.input(
			type({ projectId: "string", shellId: "string", title: "string > 0" }),
		)
		.handler(({ input }) => Continuity.renameShell(input)),
	archiveShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(async ({ input }) => {
			await AgentActivity.refresh();
			shellProcesses.closeShell(input);

			return await Continuity.archiveShell(input);
		}),
	unarchiveShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.unarchiveShell(input)),
	pinShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.pinShell(input)),
	unpinShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.unpinShell(input)),
	selectShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(async ({ input }) => {
			const selected = await Continuity.selectShell(input);

			return await stamped(input, selected);
		}),
};
