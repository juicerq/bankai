import { basename } from "node:path";
import { gitText } from "@main/git/git-run";

export async function branchLabel(cwd: string): Promise<string> {
	const branch = await gitText(cwd, ["branch", "--show-current"])
		.then((out) => out.trim())
		.catch(() => "");

	return branch || basename(cwd);
}
