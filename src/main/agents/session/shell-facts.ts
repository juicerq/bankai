import { Harnesses } from "@main/agents/harness/harnesses";
import { BranchLabel } from "@main/git/branch-label";
import { Logger } from "@main/infra/logger";
import { Continuity } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { ShellTitles } from "@main/terminal/shell-titles";
import type { ContinuitySessionRef, ContinuityShell, ContinuityValue } from "@shared/continuity";
import type { ShellName } from "@shared/continuity-reducers";

async function publishedName(shellId: string, session: ContinuitySessionRef) {
	const fromHarness = Harnesses.get(session.harness)?.publishedName;

	return await fromHarness?.(session).catch((err) => {
		Logger.warn("continuity:title-failed", { shellId, err: String(err) });

		return { state: "pending" as const };
	}) ?? { state: "pending" as const };
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

	const name = await publishedName(shell.id, session);
	if (name.state === "pending") {
		return null;
	}

	return { title: name.value, source: "harness", sessionId: session.sessionId };
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
