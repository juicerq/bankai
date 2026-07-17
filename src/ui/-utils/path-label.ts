import { homedir } from "node:os";

const HOME = homedir();

export function homePathLabel(path: string): string {
	if (path === HOME) {
		return "~";
	}
	if (path.startsWith(`${HOME}/`)) {
		return `~${path.slice(HOME.length)}`;
	}

	return path;
}

export function compactPathLabel(path: string, budget: number): string {
	const label = homePathLabel(path);
	return label.length > budget ? `\u2026${label.slice(-(budget - 1))}` : label;
}
