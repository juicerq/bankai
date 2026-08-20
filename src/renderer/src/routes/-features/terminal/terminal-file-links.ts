export interface TerminalFileTarget {
	file: string;
	line?: number;
}

interface TerminalFileLink extends TerminalFileTarget {
	start: number;
	end: number;
}

interface TerminalFileLinkOptions {
	paths: readonly string[];
	worktree?: string;
}

const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;
const LEADING_WRAPPERS = /^[([{'"`]+/;
const TRAILING_WRAPPERS = /[)\]}'"`.,;!?]+$/;
const WRAP_GAP = /^\n[ \t]*$/;
const WRAP_GAPS = /\n[ \t]*/g;

interface PathCatalog {
	paths: ReadonlySet<string>;
	worktree?: string;
	suffixes: ReadonlyMap<string, string | null>;
}

const detectors = new WeakMap<readonly string[], TerminalFileLinkDetector>();

function prepare(options: TerminalFileLinkOptions): TerminalFileLinkDetector {
	const shared = detectors.get(options.paths);

	if (shared) {
		return shared;
	}

	const detector = build(options);
	detectors.set(options.paths, detector);

	return detector;
}

function build(options: TerminalFileLinkOptions) {
	let longestPath = 0;
	const suffixes = new Map<string, string | null>();

	for (const path of options.paths) {
		longestPath = Math.max(longestPath, path.length);

		for (let slash = path.indexOf("/"); slash !== -1; slash = path.indexOf("/", slash + 1)) {
			const suffix = path.slice(slash + 1);

			suffixes.set(suffix, suffixes.has(suffix) ? null : path);
		}
	}

	const catalog: PathCatalog = { ...options, paths: new Set(options.paths), suffixes };
	const maxExternalLength = externalLength(longestPath, options.worktree);

	return {
		find(text: string) {
			return find(text, catalog, maxExternalLength);
		},
	};
}

function externalLength(pathLength: number, worktree?: string) {
	const root = worktree?.replaceAll("\\", "/").replace(/\/+$/, "");

	return Math.max(pathLength, pathLength + 2, root ? root.length + 1 + pathLength : 0);
}

function find(text: string, options: PathCatalog, maxExternalLength: number): TerminalFileLink[] {
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
	options: PathCatalog,
	maxExternalLength: number,
	words: { start: number; end: number }[],
	index: number,
) {
	const first = words[index];

	if (!first) {
		return;
	}

	let found: { link: TerminalFileLink; words: number } | undefined;
	let wrapped = false;
	for (let cursor = index; cursor < words.length; cursor += 1) {
		const last = words[cursor];
		const previous = words[cursor - 1];

		if (!last) {
			break;
		}

		if (previous && cursor > index) {
			wrapped ||= WRAP_GAP.test(text.slice(previous.end, last.start));
		}

		const span = unwrap(text.slice(first.start, last.end));
		const candidates = wrapped ? [span.text, span.text.replaceAll(WRAP_GAPS, "")] : [span.text];

		if (Math.min(...candidates.map(pathLength)) > maxExternalLength) {
			break;
		}

		for (const candidate of candidates) {
			const target = resolveTarget(candidate, options);

			if (target) {
				found = {
					link: { ...target, start: first.start + span.start, end: first.start + span.end },
					words: cursor - index + 1,
				};
				break;
			}
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

function resolveTarget(text: string, options: PathCatalog): TerminalFileTarget | undefined {
	const file = matchPath(text, options);

	if (file) {
		return { file };
	}

	const suffix = LINE_SUFFIX.exec(text);

	if (!suffix) {
		return;
	}

	const stripped = matchPath(text.slice(0, suffix.index), options);
	const line = Number(suffix[1]);

	if (!stripped || !Number.isSafeInteger(line) || line < 1) {
		return;
	}

	return { file: stripped, line };
}

function matchPath(text: string, options: PathCatalog) {
	const path = repoPath(text, options.worktree);

	if (!path) {
		return;
	}

	if (options.paths.has(path)) {
		return path;
	}

	return options.suffixes.get(path) ?? undefined;
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

export type TerminalFileLinkDetector = ReturnType<typeof build>;

export const TerminalFileLinks = { prepare };
