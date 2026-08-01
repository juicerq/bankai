import { harnessResume } from "@main/activity/harnesses";
import { Logger } from "@main/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { harnessCommandLine, shellLaunchLine } from "@main/terminal/autostart";
import { shellArgs } from "@main/terminal/commandLine";
import { SHELL } from "@main/terminal/shell";
import { type ShellAttachment, shellProcesses, type ShellRef } from "@main/terminal/ShellProcesses";
import { ShellSpawn } from "@main/terminal/ShellSpawn";
import { forgetShellTitle, noteShellTitle } from "@main/terminal/ShellTitles";
import type { TerminalAttached } from "@shared/terminal";

interface OpenInput extends ShellRef {
	cols: number;
	rows: number;
}

interface SpawnInput extends OpenInput {
	cwd: string;
	launch?: string;
}

export const TerminalSessions = {
	open: async (attachment: ShellAttachment, input: OpenInput): Promise<TerminalAttached> => {
		const [project, shell] = await Promise.all([Projects.find(input.projectId), Continuity.findShell(input)]);

		return spawnOrAttach(attachment, { ...input, cwd: project.path, launch: await shellLaunchLine(shell) });
	},
	resume: async (attachment: ShellAttachment, input: OpenInput): Promise<TerminalAttached> => {
		const shell = await Continuity.findShell(input);
		const session = shell?.session;
		if (!session) {
			throw new Error("No resumable agent session for this shell");
		}

		const resume = harnessResume(session.harness);
		if (!resume) {
			throw new Error(`Resume is not supported for harness "${session.harness}"`);
		}

		const command = resume({ sessionId: session.sessionId });
		if (!command) {
			throw new Error(`Invalid session ref for harness "${session.harness}"`);
		}

		return spawnOrAttach(attachment, {
			...input,
			cwd: session.cwd,
			launch: await harnessCommandLine(command, session.harness),
		});
	},
};

function spawnOrAttach(attachment: ShellAttachment, input: SpawnInput): TerminalAttached {
	const running = shellProcesses.find(input);
	if (running) {
		return attached(running, shellProcesses.attach(running, attachment));
	}

	const { sessionId } = ShellSpawn.run({
		projectId: input.projectId,
		shellId: input.shellId,
		cwd: input.cwd,
		cols: input.cols,
		rows: input.rows,
		args: shellArgs(SHELL, input.launch),
		onData: (data) => noteShellTitle(input.shellId, data),
		onExit: ({ spontaneous }) => {
			forgetShellTitle(input.shellId);

			if (spontaneous) {
				Continuity.clearShellSession({ projectId: input.projectId, shellId: input.shellId }).catch((err) =>
					Logger.error("terminal:exit-clear-session-failed", { sessionId, err: String(err) }),
				);
			}
		},
	});

	return attached(sessionId, shellProcesses.attach(sessionId, attachment));
}

function attached(sessionId: string, replay: string | undefined): TerminalAttached {
	if (!replay) {
		return { sessionId };
	}

	return { sessionId, replay };
}
