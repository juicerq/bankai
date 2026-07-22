import type { FileChange } from "@main/git/contracts";

export const STATUS_MARK: Record<FileChange["status"], string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "?",
};
