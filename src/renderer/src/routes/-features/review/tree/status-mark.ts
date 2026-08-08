import type { FileChange } from "@shared/review";

export const STATUS_MARK: Record<FileChange["status"], string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	renamed: "R",
	untracked: "?",
};
