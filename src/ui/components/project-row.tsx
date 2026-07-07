import { homedir } from "node:os";
import { TextAttributes } from "@opentui/core";
import type { Project } from "@core/store/projects";
import { theme } from "@ui/theme";

const HOME = homedir();
const CWD_BUDGET = 27;

function shortPath(cwd: string): string {
	const relative =
		cwd === HOME
			? "~"
			: cwd.startsWith(`${HOME}/`)
				? `~${cwd.slice(HOME.length)}`
				: cwd;
	return relative.length > CWD_BUDGET ? `\u2026${relative.slice(-CWD_BUDGET)}` : relative;
}

export function ProjectRow({ project, active }: { project: Project; active: boolean }) {
	const marker = active ? "▎ " : "  ";

	return (
		<box style={{ flexDirection: "column" }}>
			<text>
				<span style={{ fg: active ? theme.accent : theme.textFaint }}>{marker}</span>
				<span
					style={{
						fg: active ? theme.text : theme.textDim,
						attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
					}}
				>
					{project.name}
				</span>
			</text>
			<text style={{ fg: theme.textFaint }}>{`  ${shortPath(project.cwd)}`}</text>
		</box>
	);
}
