export interface TerminalFileTarget {
	file: string;
	line?: number;
}

interface TerminalFileLink extends TerminalFileTarget {
	start: number;
	end: number;
}

interface TerminalFileLinkInput {
	text: string;
	paths: ReadonlySet<string>;
	worktree?: string;
}

const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;
const LEADING_WRAPPERS = /^[([{'"`]+/;
const TRAILING_WRAPPERS = /[)\]}'"`.,;!?]+$/;

function find(input: TerminalFileLinkInput): TerminalFileLink[] {
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

function longestPathAt(input: TerminalFileLinkInput, words: { start: number; end: number }[], index: number) {
	const first = words[index];

	if (!first) {
		return;
	}

	for (let count = words.length - index; count > 0; count -= 1) {
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

function resolveTarget(text: string, input: TerminalFileLinkInput): TerminalFileTarget | undefined {
	const file = repoPath(text, input.worktree);

	if (file && input.paths.has(file)) {
		return { file };
	}

	const suffix = LINE_SUFFIX.exec(text);

	if (!suffix) {
		return;
	}

	const stripped = repoPath(text.slice(0, suffix.index), input.worktree);
	const line = Number(suffix[1]);

	if (!stripped || !input.paths.has(stripped) || !Number.isSafeInteger(line) || line < 1) {
		return;
	}

	return { file: stripped, line };
}

function repoPath(text: string, worktree?: string) {
	const normalized = text.replaceAll("\\", "/");

	if (normalized.startsWith("./")) {
		return normalized.slice(2);
	}

	const root = worktree && (worktree.replaceAll("\\", "/").replace(/\/+$/, "") || "/");

	if (root && normalized.startsWith(root === "/" ? root : `${root}/`)) {
		return normalized.slice(root === "/" ? 1 : root.length + 1);
	}

	if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
		return;
	}

	return normalized;
}

export const TerminalFileLinks = { find };
