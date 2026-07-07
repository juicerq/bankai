import { TextAttributes } from "@opentui/core";
import type { Project } from "@core/store/projects";
import { ProjectRow } from "@ui/components/project-row";
import { theme } from "@ui/theme";

const WIDTH = 32;

export function ProjectSidebar({
	projects,
	activeIndex,
}: {
	projects: Project[];
	activeIndex: number;
}) {
	return (
		<box
			style={{
				width: WIDTH,
				flexDirection: "column",
				backgroundColor: theme.panel,
				border: ["right"],
				borderColor: theme.border,
			}}
		>
			<box style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1, flexDirection: "column" }}>
				<text>
					<span style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>PROJECT</span>
					<span style={{ fg: theme.textFaint }}>·</span>
					<span style={{ fg: theme.text, attributes: TextAttributes.BOLD }}>J</span>
				</text>
				<text style={{ fg: theme.textFaint }}>cockpit</text>
			</box>

			<box style={{ flexGrow: 1, flexDirection: "column", padding: 1, gap: 1 }}>
				{projects.length === 0 && <text style={{ fg: theme.textDim }}>No projects yet.</text>}
				{projects.map((project, index) => (
					<ProjectRow key={project.id} project={project} active={index === activeIndex} />
				))}
			</box>

			<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1, flexDirection: "column" }}>
				<text style={{ fg: theme.textFaint }}>a add · r rename · d remove</text>
				<text style={{ fg: theme.textFaint }}>⇧↑↓ reorder · ⏎ shell</text>
			</box>
		</box>
	);
}
