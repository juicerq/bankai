import type { ReactNode, TransitionEvent } from "react";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useFullscreenProjectRail } from "@renderer/routes/-utils/use-fullscreen-project-rail";

export function ProjectRailFrame({
	projectRail,
	children,
}: {
	projectRail: ReturnType<typeof useFullscreenProjectRail>;
	children: ReactNode;
}) {
	const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width") {
			projectRail.finishMotion();
		}
	};

	return (
		<div
			data-component="project-workspace-layout"
			data-fullscreen={projectRail.fullscreen}
			data-animating={projectRail.animating}
			data-motion-duration={LAYOUT_MOTION_DURATION_MS}
			style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
			className={`relative h-full shrink-0 transition-[width] ease-out motion-reduce:transition-none ${
				projectRail.fullscreen ? "w-0" : "w-rail"
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
				data-revealed={projectRail.fullscreen ? projectRail.revealed : true}
				data-motion-duration={LAYOUT_MOTION_DURATION_MS}
				inert={projectRail.fullscreen && !projectRail.revealed}
				style={{ transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
				className={
					projectRail.fullscreen
						? `absolute inset-y-0 left-0 z-40 flex w-rail shrink-0 transition-[transform,opacity] ease-out motion-reduce:transition-none ${
							projectRail.revealed
								? "translate-x-0 opacity-100 shadow-[4px_0_16px_rgba(0,0,0,0.32)]"
								: "pointer-events-none -translate-x-full opacity-0"
						}`
						: "absolute inset-y-0 left-0 z-40 flex w-rail shrink-0 transition-none"
				}
				onPointerEnter={projectRail.handleRailPointerEnter}
				onPointerLeave={projectRail.handleRailPointerLeave}
				onFocusCapture={projectRail.handleRailFocus}
				onBlurCapture={projectRail.handleRailBlur}
			>
				{children}
			</div>
		</div>
	);
}
