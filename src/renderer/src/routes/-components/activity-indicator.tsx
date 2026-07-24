import type { Project } from "@main/store/projects";
import type { AgentActivityState } from "@shared/activity";
import { type AnnouncePhase, useActivityAnnounce } from "@renderer/routes/-utils/activity-announce";
import { ACTIVITY_DOT_CLASS, ACTIVITY_TEXT_CLASS } from "@renderer/routes/-utils/agent-activity";

const PHASE_WIDTH_CLASS: Record<AnnouncePhase, string> = {
	enter: "mr-2 max-w-0",
	announce: "mr-2 max-w-[240px]",
	residue: "mr-2 max-w-[14px]",
	leaving: "mr-0 max-w-0",
};

export function ActivityIndicator({
	projects,
	activeProjectId,
}: {
	projects: Project[];
	activeProjectId: string;
}) {
	const others = projects.filter((project) => project.id !== activeProjectId).map((project) => project.id);
	const announce = useActivityAnnounce(others);
	const items = projects
		.map((project, index) => ({ project, digit: index + 1 }))
		.filter(({ project }) => project.id !== activeProjectId && announce.has(project.id));

	if (items.length === 0) {
		return null;
	}

	return (
		<div
			data-component="activity-indicator"
			className="flex h-full shrink-0 items-center overflow-hidden pl-3"
			aria-hidden="true"
		>
			{items.map(({ project, digit }) => {
				const signal = announce.get(project.id);
				if (!signal) {
					return null;
				}

				return (
					<ActivityIndicatorItem
						key={project.id}
						projectId={project.id}
						name={project.name}
						digit={digit}
						state={signal.state}
						phase={signal.phase}
					/>
				);
			})}
		</div>
	);
}

function ActivityIndicatorItem({
	projectId,
	name,
	digit,
	state,
	phase,
}: {
	projectId: string;
	name: string;
	digit: number;
	state: AgentActivityState;
	phase: AnnouncePhase;
}) {
	const announcing = phase === "enter" || phase === "announce";

	return (
		<div
			data-component="activity-indicator-item"
			data-project-id={projectId}
			data-activity={state}
			data-digit={digit}
			data-phase={phase}
			className={`flex items-center gap-[7px] overflow-hidden whitespace-nowrap transition-[max-width,margin-right] duration-300 ease-out ${PHASE_WIDTH_CLASS[phase]}`}
		>
			<span className="flex flex-col items-center gap-[2px]">
				<span
					className={`text-[11px] font-bold leading-none ${announcing ? ACTIVITY_TEXT_CLASS[state] : "text-terminal-bright-black"}`}
				>
					{digit}
				</span>
				<span className={`h-[2px] w-[10px] rounded-full ${ACTIVITY_DOT_CLASS[state]}`} />
			</span>
			{announcing && (
				<span className={`text-[10px] font-bold uppercase tracking-[0.08em] ${ACTIVITY_TEXT_CLASS[state]}`}>
					{name} · {state}
				</span>
			)}
		</div>
	);
}
