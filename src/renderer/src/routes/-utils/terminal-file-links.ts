export interface TerminalFileTarget {
	file: string;
	line?: number;
}

export interface TerminalFileLink extends TerminalFileTarget {
	start: number;
	end: number;
}

const MAX_PATH_WORDS = 4;
const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;
const LEADING_WRAPPERS = /^[([{'"`]+/;
const TRAILING_WRAPPERS = /[)\]}'"`.,;!?]+$/;

interface LinkInput {
	text: string;
	paths: ReadonlySet<string>;
	worktree?: string;
}

export function terminalFileLinks(input: LinkInput): TerminalFileLink[] {
	const words = [...input.text.matchAll(/\S+/g)].map((match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
	const links: TerminalFileLink[] = [];
	let index = 0;

	while (index < words.length) {
		const match = longestPathAt(input, words, index);

		if (!match) {
			index += 1;
			continue;
		}

		links.push(match.link);
		index += match.words;
	}

	return links;
}

function longestPathAt(input: LinkInput, words: { start: number; end: number }[], index: number) {
	const first = words[index];

	if (!first) {
		return;
	}

	for (let count = Math.min(MAX_PATH_WORDS, words.length - index); count > 0; count -= 1) {
		const last = words[index + count - 1];

		if (!last) {
			continue;
		}

		const span = unwrap(input.text.slice(first.start, last.end));
		const target = resolveTarget(span.text, input);

		if (target) {
			return {
				link: { ...target, start: first.start + span.start, end: first.start + span.end },
				words: count,
			};
		}
	}

	return;
}

function unwrap(text: string) {
	const start = LEADING_WRAPPERS.exec(text)?.[0].length ?? 0;
	const body = text.slice(start);
	const trailing = TRAILING_WRAPPERS.exec(body)?.[0].length ?? 0;
	const end = body.length - trailing;

	return { text: body.slice(0, end), start, end: start + end };
}

function resolveTarget(text: string, input: LinkInput): TerminalFileTarget | undefined {
	const file = repoPath(text, input.worktree);

	if (file && input.paths.has(file)) {
		return { file };
	}

	const suffix = LINE_SUFFIX.exec(text);

	if (!suffix) {
		return undefined;
	}

	const stripped = repoPath(text.slice(0, suffix.index), input.worktree);

	if (!stripped || !input.paths.has(stripped)) {
		return undefined;
	}

	return { file: stripped, line: Number(suffix[1]) };
}

function repoPath(text: string, worktree?: string) {
	if (text.startsWith("./")) {
		return text.slice(2);
	}

	if (!text.startsWith("/")) {
		return text;
	}

	if (!worktree || !text.startsWith(`${worktree}/`)) {
		return;
	}

	return text.slice(worktree.length + 1);
}
