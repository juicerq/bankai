import type {
	TerminalFileLinkDetector,
	TerminalFileTarget,
} from "@renderer/routes/-features/terminal/terminal-file-links";
import { TerminalUrlLinks } from "@renderer/routes/-features/terminal/terminal-url-links";

type TerminalLinkTarget =
	| { kind: "file"; target: TerminalFileTarget }
	| { kind: "url"; url: string };

interface TerminalLink {
	start: number;
	end: number;
	target: TerminalLinkTarget;
}

function find(options: {
	text: string;
	fileDetector?: TerminalFileLinkDetector;
	includeUrls: boolean;
}): TerminalLink[] {
	const fileLinks = options.fileDetector?.find(options.text).map(({ start, end, ...target }) => ({
		start,
		end,
		target: { kind: "file" as const, target },
	})) ?? [];
	const urlLinks = options.includeUrls
		? TerminalUrlLinks.find(options.text).map(({ start, end, url }) => ({
			start,
			end,
			target: { kind: "url" as const, url },
		}))
		: [];
	const candidates = [...fileLinks, ...urlLinks].sort((left, right) => {
		if (left.start !== right.start) {
			return left.start - right.start;
		}

		if (left.end !== right.end) {
			return right.end - left.end;
		}

		if (left.target.kind === "url") {
			return -1;
		}

		return 1;
	});
	const links: TerminalLink[] = [];

	for (const candidate of candidates) {
		const previous = links.at(-1);
		if (previous && candidate.start < previous.end) {
			continue;
		}

		links.push(candidate);
	}

	return links;
}

export const TerminalLinks = { find };
