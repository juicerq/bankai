import { SessionPageUrl } from "@shared/session-page";

interface TerminalUrlLink {
	url: string;
	start: number;
	end: number;
}

const URL_CANDIDATE = /https?:\/\/\S+/gi;
const TRAILING_PUNCTUATION = /[)\]}'"`>,.:;!?]+$/;

function find(text: string): TerminalUrlLink[] {
	const links: TerminalUrlLink[] = [];

	for (const match of text.matchAll(URL_CANDIDATE)) {
		const candidate = match[0].replace(TRAILING_PUNCTUATION, "");
		const url = SessionPageUrl.parse(candidate);

		if (!url) {
			continue;
		}

		links.push({ url, start: match.index, end: match.index + candidate.length });
	}

	return links;
}

export const TerminalUrlLinks = { find };
