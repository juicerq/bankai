export interface TerminalFileTarget {
	file: string;
	line?: number;
}

interface TerminalFileLink extends TerminalFileTarget {
	start: number;
	end: number;
}

interface TerminalFileLinkOptions {
	paths: ReadonlySet<string>;
	worktree?: string;
}

const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;
const LEADING_WRAPPERS = /^[([{'"`]+/;
const TRAILING_WRAPPERS = /[)\]}'"`.,;!?]+$/;

function prepare(options: TerminalFileLinkOptions) {
	let longestPath = 0;
	for (const path of options.paths) {
		longestPath = Math.max(longestPath, path.length);
	}
	const maxExternalLength = externalLength(longestPath, options.worktree);

	return {
		find(text: string) {
			return find(text, options, maxExternalLength);
		},
	};
}

function externalLength(pathLength: number, worktree?: string) {
	const root = worktree?.replaceAll("\\", "/").replace(/\/+$/, "");

	return Math.max(pathLength, pathLength + 2, root ? root.length + 1 + pathLength : 0);
}

function find(text: string, options: TerminalFileLinkOptions, maxExternalLength: number): TerminalFileLink[] {
	const words = [...text.matchAll(/\S+/g)].map((match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
	const links: TerminalFileLink[] = [];
	let index = 0;

	while (index < words.length) {
		const match = longestPathAt(text, options, maxExternalLength, words, index);

		if (!match) {
			index += 1;
			continue;
		}

		links.push(match.link);
		index += match.words;
	}

	return links;
}

function longestPathAt(
	text: string,
	options: TerminalFileLinkOptions,
	maxExternalLength: number,
	words: { start: number; end: number }[],
	index: number,
) {
	const first = words[index];

	if (!first) {
		return;
	}

	let found: { link: TerminalFileLink; words: number } | undefined;
	for (let cursor = index; cursor < words.length; cursor += 1) {
		const last = words[cursor];

		if (!last) {
			break;
		}

		const span = unwrap(text.slice(first.start, last.end));
		if (pathLength(span.text) > maxExternalLength) {
			break;
		}

		const target = resolveTarget(span.text, options);

		if (target) {
			found = {
				link: { ...target, start: first.start + span.start, end: first.start + span.end },
				words: cursor - index + 1,
			};
		}
	}

	return found;
}

function pathLength(text: string) {
	return LINE_SUFFIX.exec(text)?.index ?? text.length;
}

function unwrap(text: string) {
	const start = LEADING_WRAPPERS.exec(text)?.[0].length ?? 0;
	const body = text.slice(start);
	const trailing = TRAILING_WRAPPERS.exec(body)?.[0].length ?? 0;
	const end = body.length - trailing;

	return { text: body.slice(0, end), start, end: start + end };
}

function resolveTarget(text: string, options: TerminalFileLinkOptions): TerminalFileTarget | undefined {
	const file = repoPath(text, options.worktree);

	if (file && options.paths.has(file)) {
		return { file };
	}

	const suffix = LINE_SUFFIX.exec(text);

	if (!suffix) {
		return;
	}

	const stripped = repoPath(text.slice(0, suffix.index), options.worktree);
	const line = Number(suffix[1]);

	if (!stripped || !options.paths.has(stripped) || !Number.isSafeInteger(line) || line < 1) {
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

export type TerminalFileLinkDetector = ReturnType<typeof prepare>;

export const TerminalFileLinks = { prepare };
