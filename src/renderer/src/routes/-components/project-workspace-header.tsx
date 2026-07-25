import { ArrowsPointingInIcon, ArrowsPointingOutIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import type { Project } from "@main/store/projects";
import { ActivityIndicator } from "@renderer/routes/-components/activity-indicator";
import { ProjectWorkspaceShellTabs } from "@renderer/routes/-components/project-workspace-shell-tabs";
import { UpdateButton } from "@renderer/routes/-components/update-button";
import { useWorkspaceAgents, useWorkspaceControl } from "@renderer/routes/-utils/workspace-context";
import type { useShellTabs } from "@renderer/routes/-utils/use-shell-tabs";

export function ProjectWorkspaceHeader({
	project,
	shells,
	active,
	fullscreen,
	reviewOpen,
	onToggleReview,
}: {
	project: Project;
	shells: ReturnType<typeof useShellTabs>;
	active: boolean;
	fullscreen: boolean;
	reviewOpen: boolean;
	onToggleReview: () => void;
}) {
	const { projects, onToggleFullscreen } = useWorkspaceControl();
	const agents = useWorkspaceAgents();

	return (
		<header className="flex h-header shrink-0 items-center border-outline border-b bg-surface-raised pr-[120px]">
			{active && fullscreen && <ActivityIndicator projects={projects} activeProjectId={project.id} />}
			<ProjectWorkspaceShellTabs
				tabs={shells.tabs}
				activeTabId={shells.activeTabId}
				shellActivity={agents.shells}
				sessionIds={shells.sessionIds}
				onSelect={shells.selectTab}
				onClose={shells.closeTab}
				onMove={shells.moveTab}
				onNew={shells.openTab}
			/>
			{active && <UpdateButton />}
			<ProjectWorkspaceHeaderToggle
				className="border-l"
				pressed={fullscreen}
				label="Toggle focus mode"
				title="Toggle focus mode (Ctrl+X F)"
				onClick={onToggleFullscreen}
			>
				{fullscreen ? <ArrowsPointingInIcon className="size-4" /> : <ArrowsPointingOutIcon className="size-4" />}
			</ProjectWorkspaceHeaderToggle>
			<ProjectWorkspaceHeaderToggle
				className="border-x"
				expanded={reviewOpen}
				pressed={reviewOpen}
				label="Toggle review panel"
				title="Toggle review panel (Ctrl+X R)"
				onClick={onToggleReview}
			>
				<ViewColumnsIcon className="size-4" />
			</ProjectWorkspaceHeaderToggle>
		</header>
	);
}

function ProjectWorkspaceHeaderToggle({
	className,
	pressed,
	expanded,
	label,
	title,
	onClick,
	children,
}: {
	className: string;
	pressed: boolean;
	expanded?: boolean;
	label: string;
	title: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={`flex h-full w-header shrink-0 items-center justify-center border-outline hover:bg-surface-hover hover:text-primary ${className} ${
				pressed ? "bg-surface-active text-primary" : "text-secondary"
			}`}
			aria-pressed={expanded === undefined ? pressed : undefined}
			aria-expanded={expanded}
			aria-label={label}
			title={title}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
