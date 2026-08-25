import { Harnesses } from "@main/agents/harness/harnesses";
import { BranchLabel } from "@main/git/branch-label";
import { Logger } from "@main/infra/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { ShellTitles } from "@main/terminal/shell-titles";
import type { ContinuitySessionRef, ContinuityShell, ContinuityValue } from "@shared/continuity";
import type { ShellName } from "@shared/continuity-reducers";

async function harnessTitle(shellId: string, session: ContinuitySessionRef): Promise<string | null> {
	const fromHarness = Harnesses.get(session.harness)?.title;
	if (!fromHarness) {
		return null;
	}

	return await fromHarness(session).catch((err) => {
		Logger.warn("continuity:title-failed", { shellId, err: String(err) });

		return null;
	});
}

async function shellName(
	shell: ContinuityShell,
	session: ContinuitySessionRef | undefined,
): Promise<ShellName | null> {
	if (shell.titleSource === "user") {
		return null;
	}

	if (!session) {
		return null;
	}

	if (shell.titleSessionId === session.sessionId) {
		return null;
	}

	const title = await harnessTitle(shell.id, session);
	if (!title) {
		return null;
	}

	return { title, source: "harness", sessionId: session.sessionId };
}

async function nameShell(input: {
	projectId: string;
	shellId: string;
	session?: ContinuitySessionRef;
}): Promise<void> {
	const shell = await Continuity.findShell(input);
	if (!shell) {
		return;
	}

	const name = await shellName(shell, input.session ?? shell.session);
	if (name) {
		await Continuity.nameShell({ projectId: input.projectId, shellId: input.shellId, ...name });
	}
}

async function stampShell(input: {
	projectId: string;
	shellId: string;
	cwd?: string;
}): Promise<ContinuityValue> {
	const shell = await Continuity.findShell(input);
	const cwd = input.cwd ?? shell?.session?.cwd ?? (await Projects.find(input.projectId)).path;
	const address = { projectId: input.projectId, shellId: input.shellId };
	await nameShell({ ...address, ...(shell?.session && { session: shell.session }) });

	const terminalTitle = shell?.session ? undefined : ShellTitles.byShell.get(input.shellId);

	return await Continuity.touchShell({
		...address,
		branch: await BranchLabel.of(cwd),
		...(terminalTitle ? { title: terminalTitle } : {}),
	});
}

export const ShellFacts = {
	name: nameShell,
	stamp: stampShell,
};
