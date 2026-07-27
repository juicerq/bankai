import { type } from "arktype";
import { stampShell } from "@main/continuity/ShellFacts";
import { GitProcess } from "@main/git/GitProcess";
import { Logger } from "@main/logger";
import { base } from "@main/router/_base";
import { Continuity, type ContinuityValue } from "@main/store/continuity";

const shellInput = type({ id: "string", label: "string", "plain?": "boolean" });

async function stamped(
	input: { projectId: string; shellId: string },
	fallback: ContinuityValue,
): Promise<ContinuityValue> {
	return await stampShell(input).catch((err) => {
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

			return await stamped({ projectId: input.projectId, shellId: input.shell.id }, opened);
		}),
	closeShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => {
			GitProcess.forgetTurn(input.shellId).catch((err) =>
				Logger.error("review:forget-turn-failed", { shellId: input.shellId, err: String(err) }),
			);

			return Continuity.closeShell(input);
		}),
	renameShell: base
		.input(type({ projectId: "string", shellId: "string", title: "string > 0" }))
		.handler(({ input }) => Continuity.renameShell(input)),
	archiveShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.archiveShell(input)),
	unarchiveShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(({ input }) => Continuity.unarchiveShell(input)),
	selectShell: base
		.input(type({ projectId: "string", shellId: "string" }))
		.handler(async ({ input }) => {
			const selected = await Continuity.selectShell(input);

			return await stamped(input, selected);
		}),
};
