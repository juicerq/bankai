import { Harnesses } from "@main/agents/harness/harnesses";
import { Logger } from "@main/infra/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { ShellAutostart } from "@main/terminal/shell-autostart";
import { ShellCommandLine } from "@main/terminal/shell-command-line";
import { SHELL } from "@main/terminal/shell-binary";
import { type ShellAttachment, shellProcesses, type ShellRef } from "@main/terminal/shell-processes";
import { ShellSpawn } from "@main/terminal/shell-spawn";
import { ShellTitles } from "@main/terminal/shell-titles";
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

		return spawnOrAttach(attachment, { ...input, cwd: project.path, launch: await ShellAutostart.launchLine(shell) });
	},
	resume: async (attachment: ShellAttachment, input: OpenInput): Promise<TerminalAttached> => {
		const shell = await Continuity.findShell(input);
		const session = shell?.session;
		if (!session) {
			throw new Error("No resumable agent session for this shell");
		}

		const resume = Harnesses.resume(session.harness);
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
			launch: await ShellAutostart.harnessLine(command, session.harness),
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
		args: ShellCommandLine.shellArgs(SHELL, input.launch),
		onData: (data) => ShellTitles.note(input.shellId, data),
		onExit: ({ spontaneous }) => {
			ShellTitles.forget(input.shellId);

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
