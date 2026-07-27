import { harnessTitle } from "@main/activity/harnesses";
import { branchLabel } from "@main/git/branch";
import { Logger } from "@main/logger";
import { Continuity, type ContinuityShell, type ContinuityValue } from "@main/store/continuity";
import { Projects } from "@main/store/projects";
import { shellTitles } from "@main/terminal/ShellTitles";

async function deriveTitle(shell: ContinuityShell): Promise<string | null> {
	if (!shell.session) {
		return shellTitles.get(shell.id) ?? null;
	}

	const fromHarness = harnessTitle(shell.session.harness);
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

export async function stampShell(input: {
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
		branch: await branchLabel(cwd),
		...(title ? { title } : {}),
	});
}
