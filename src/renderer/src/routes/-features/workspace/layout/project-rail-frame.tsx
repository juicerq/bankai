import { type ReactNode, type RefObject, type TransitionEvent, useCallback, useSyncExternalStore } from "react";
import { Divider } from "@renderer/routes/-features/shared/interaction/divider";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import { ProjectRailReveal } from "@renderer/routes/-features/workspace/layout/project-rail-reveal";
import { RAIL_WIDTH_PROPERTY, RAIL_WIDTH_VALUE } from "@renderer/routes/-features/workspace/layout/rail-layout";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";
import type { useFullscreenProjectRail } from "@renderer/routes/-features/workspace/layout/use-fullscreen-project-rail";

export function ProjectRailFrame({
	projectRail,
	divider,
	frameRef,
	railWidth,
	children,
}: {
	projectRail: ReturnType<typeof useFullscreenProjectRail>;
	divider: ReturnType<typeof useDivider>;
	frameRef: RefObject<HTMLDivElement | null>;
	railWidth: number;
	children: ReactNode;
}) {
	const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width") {
			projectRail.finishMotion();
		}
	};
	const revealed = useSyncExternalStore(ProjectRailReveal.subscribe, ProjectRailReveal.get);
	const collapsing = !projectRail.fullscreen && divider.intent === "focus";
	const registerFrame = useCallback(
		(node: HTMLDivElement | null) => {
			frameRef.current = node;
			node?.style.setProperty(RAIL_WIDTH_PROPERTY, `${railWidth}px`);
		},
		[frameRef, railWidth],
	);

	return (
		<div
			ref={registerFrame}
			data-component="project-workspace-layout"
			data-fullscreen={projectRail.fullscreen}
			data-animating={projectRail.animating}
			data-motion-duration={LAYOUT_MOTION_DURATION_MS}
			style={{ width: projectRail.fullscreen ? 0 : RAIL_WIDTH_VALUE, transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
			className={`relative h-full shrink-0 ease-out motion-reduce:transition-none ${
				projectRail.animating ? "transition-[width]" : "transition-none"
			}`}
			onTransitionEnd={handleTransitionEnd}
			onTransitionCancel={handleTransitionEnd}
		>
			{projectRail.fullscreen && (
				<div
					data-component="project-rail-activation"
					aria-hidden="true"
					className="absolute inset-y-0 left-0 z-40 w-2"
					onPointerEnter={projectRail.handleEdgeEnter}
				/>
			)}
			<div
				ref={projectRail.registerRail}
				data-component="project-rail-frame"
				data-fullscreen={projectRail.fullscreen}
				data-revealed={projectRail.fullscreen ? revealed : true}
				data-collapsing={collapsing}
				data-motion-duration={LAYOUT_MOTION_DURATION_MS}
				inert={projectRail.fullscreen && !revealed}
				style={{ width: RAIL_WIDTH_VALUE, transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
				className={
					projectRail.fullscreen
						? `absolute inset-y-0 left-0 z-40 flex shrink-0 transition-[transform,opacity] ease-out motion-reduce:transition-none ${
							revealed
								? "translate-x-0 opacity-100 shadow-[4px_0_16px_var(--color-shadow)]"
								: "pointer-events-none -translate-x-full opacity-0"
						}`
						: "absolute inset-y-0 left-0 z-40 flex shrink-0 transition-none"
				}
				onPointerEnter={projectRail.handleRailPointerEnter}
				onPointerLeave={projectRail.handleRailPointerLeave}
				onPointerDownCapture={projectRail.handleRailPointerDown}
				onFocusCapture={projectRail.handleRailFocus}
				onBlurCapture={projectRail.handleRailBlur}
			>
				<div className={`flex min-h-0 w-full ${collapsing ? "opacity-35" : ""}`}>{children}</div>
				<Divider control={divider} side="right" label="Resize project rail" />
			</div>
		</div>
	);
}
