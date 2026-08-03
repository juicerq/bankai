import { basename } from "node:path";
import { GitRun } from "@main/git/git-run";

async function branchLabel(cwd: string): Promise<string> {
	const branch = await GitRun.text(cwd, ["branch", "--show-current"])
		.then((out) => out.trim())
		.catch(() => "");

	return branch || basename(cwd);
}

export const BranchLabel = {
	of: branchLabel,
};
