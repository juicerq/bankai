import { Harnesses } from "@main/agents/harness/harnesses";
import { BranchLabel } from "@main/git/branch-label";
import { Logger } from "@main/infra/logger";
import { Continuity, type ContinuityShell, type ContinuityValue } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { ShellTitles } from "@main/terminal/shell-titles";

async function deriveTitle(shell: ContinuityShell): Promise<string | null> {
	if (!shell.session) {
		return ShellTitles.byShell.get(shell.id) ?? null;
	}

	const fromHarness = Harnesses.title(shell.session.harness);
	if (!fromHarness) {
		return null;
	}

	return await fromHarness(shell.session);
}

async function firstTitle(shell: ContinuityShell | undefined): Promise<string | null> {
	if (!shell || shell.title) {
		return null;
	}

	return await deriveTitle(shell).catch((err) => {
		Logger.warn("continuity:title-failed", { shellId: shell.id, err: String(err) });
		return null;
	});
}

async function stampShell(input: {
	projectId: string;
	shellId: string;
	cwd?: string;
	publishedName?: string;
}): Promise<ContinuityValue> {
	const shell = await Continuity.findShell(input);
	const cwd = input.cwd ?? shell?.session?.cwd ?? (await Projects.find(input.projectId)).path;
	const published = shell?.titleSource === "user" ? undefined : input.publishedName;

	if (published) {
		await Continuity.nameShell({
			projectId: input.projectId,
			shellId: input.shellId,
			title: published,
			source: "published",
		});
	}

	const title = published ? null : await firstTitle(shell);

	return await Continuity.touchShell({
		projectId: input.projectId,
		shellId: input.shellId,
		branch: await BranchLabel.of(cwd),
		...(title ? { title } : {}),
	});
}

export const ShellFacts = {
	stamp: stampShell,
};
