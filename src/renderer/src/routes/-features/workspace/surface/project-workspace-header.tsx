import {
	ArrowsPointingInIcon,
	ArrowsPointingOutIcon,
	Cog6ToothIcon,
	CommandLineIcon,
	ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import type { Project } from "@shared/projects";
import { UpdateButton } from "@renderer/routes/-features/app/update/update-button";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import { WINDOW_DRAG_CLASS, WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-features/app/chrome/window-drag";
import { useWorkspaceControl, useWorkspaceTopBand } from "@renderer/routes/-features/workspace/layout/workspace-context";

export function ProjectWorkspaceHeader({
	project,
	active,
	fullscreen,
	animating,
	reviewOpen,
	onToggleReview,
}: {
	project: Project;
	active: boolean;
	fullscreen: boolean;
	animating: boolean;
	reviewOpen: boolean;
	onToggleReview: () => void;
}) {
	const { onToggleFullscreen, onOpenSettings, onOpenCommands } = useWorkspaceControl();
	const topBand = useWorkspaceTopBand();

	return (
		<div
			data-component="workspace-header-frame"
			data-fullscreen={fullscreen}
			style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
			className={`relative shrink-0 ease-out motion-reduce:transition-none ${fullscreen ? "h-0" : "h-header"} ${
				animating ? "transition-[height]" : "transition-none"
			}`}
		>
			<header
				inert={fullscreen && !topBand.revealed}
				data-revealed={fullscreen ? topBand.revealed : true}
				style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
				onFocusCapture={topBand.onFocus}
				onBlurCapture={topBand.onBlur}
				className={`absolute inset-x-0 top-0 flex h-header items-center border-outline border-b bg-surface-raised pr-[120px] ${WINDOW_DRAG_CLASS} ${
					fullscreen
						? `z-30 transition-[transform,opacity] ease-out motion-reduce:transition-none ${
							topBand.revealed
								? "translate-y-0 opacity-100 shadow-[0_4px_16px_var(--color-shadow)]"
								: "pointer-events-none -translate-y-full opacity-0"
						}`
						: ""
				}`}
			>
				<span className="min-w-0 flex-1 truncate px-3 text-body text-secondary">{project.name}</span>
				{active && <UpdateButton />}
				<ProjectWorkspaceHeaderAction
					className="border-l"
					pressed={fullscreen}
					label="Toggle focus mode"
					title="Toggle focus mode (Ctrl+X F)"
					onClick={onToggleFullscreen}
				>
					{fullscreen ? <ArrowsPointingInIcon className="size-4" /> : <ArrowsPointingOutIcon className="size-4" />}
				</ProjectWorkspaceHeaderAction>
				<ProjectWorkspaceHeaderAction
					className="border-l"
					expanded={reviewOpen}
					pressed={reviewOpen}
					label="Toggle review panel"
					title="Toggle review panel (Ctrl+X R)"
					onClick={onToggleReview}
				>
					<ViewColumnsIcon className="size-4" />
				</ProjectWorkspaceHeaderAction>
				<ProjectWorkspaceHeaderAction
					className="border-l"
					label="Open commands"
					title="Open commands (Ctrl+X C)"
					onClick={onOpenCommands}
				>
					<CommandLineIcon className="size-4" />
				</ProjectWorkspaceHeaderAction>
				<ProjectWorkspaceHeaderAction
					className="border-x"
					label="Open settings"
					title="Open settings (Ctrl+X ,)"
					onClick={onOpenSettings}
				>
					<Cog6ToothIcon className="size-4" />
				</ProjectWorkspaceHeaderAction>
			</header>
		</div>
	);
}

function ProjectWorkspaceHeaderAction({
	className,
	pressed,
	expanded,
	label,
	title,
	onClick,
	children,
}: {
	className: string;
	pressed?: boolean;
	expanded?: boolean;
	label: string;
	title: string;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			className={`flex h-full w-header shrink-0 items-center justify-center border-outline hover:bg-surface-hover hover:text-primary ${WINDOW_NO_DRAG_CLASS} ${className} ${
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
