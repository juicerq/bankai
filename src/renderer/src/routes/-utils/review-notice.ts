import type { ReviewContent } from "@main/git/git-contracts";

export function reviewContentNotice({
	content,
	full,
}: {
	content: Exclude<ReviewContent, { status: "ready" }>;
	full: boolean;
}): string {
	switch (content.status) {
		case "empty":
			return "Empty file.";
		case "binary":
			return "Binary content cannot be shown.";
		case "image":
			return "Image content cannot be shown yet.";
		case "too-large":
			if (content.lineCount) {
				return `${full ? "Too large to show in full" : "Too large to show"}: ${content.lineCount} lines.`;
			}
			if (full) {
				return "Too large to show in full.";
			}

			return "Too large to show.";
		case "unavailable":
			return "File unavailable. Retrying\u2026";
	}
}
