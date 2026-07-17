import { TextAttributes } from "@opentui/core";
import type { Project } from "@core/store/projects";
import { compactPathLabel } from "@ui/-utils/path-label";
import { theme } from "@ui/theme";

const CWD_BUDGET = 27;

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
			<text style={{ fg: theme.textFaint }}>
				{`  ${compactPathLabel(project.cwd, CWD_BUDGET)}`}
			</text>
		</box>
	);
}
