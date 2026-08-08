import type { ReactNode, TransitionEvent } from "react";
import { Divider } from "@renderer/routes/-features/shared/interaction/divider";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";

export type ReviewPanelMotion = "open" | "expand";

export function ReviewPanelFrame({
	open,
	expanded,
	motion,
	width,
	liveWidth,
	divider,
	onMotionEnd,
	children,
}: {
	open: boolean;
	expanded: boolean;
	motion: ReviewPanelMotion | undefined;
	width: number;
	liveWidth: string;
	divider: ReturnType<typeof useDivider>;
	onMotionEnd: () => void;
	children: ReactNode;
}) {
	const animating = motion !== undefined && !divider.resizing;
	// The clip that hides the panel while it opens has to come off for it to reach
	// past the width it reserves, and stay off until it has docked back.
	const covering = open && (expanded || (animating && motion === "expand"));
	// Expanded, the row keeps holding the width the panel docks at: the surface
	// grows over the shells rather than taking their columns away from them.
	const openWidth = expanded ? `${width}px` : liveWidth;
	const endMotion = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width") {
			onMotionEnd();
		}
	};

	return (
		<div
			data-component="review-panel-frame"
			data-open={open}
			data-expanded={expanded}
			data-animating={animating}
			data-covering={covering}
			data-width={width}
			data-motion-duration={LAYOUT_MOTION_DURATION_MS}
			inert={!open}
			style={{
				width: open ? openWidth : 0,
				transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms`,
			}}
			className={`relative h-full shrink-0 ease-out motion-reduce:transition-none ${covering ? "z-20" : ""} ${
				animating && motion === "open" ? "transition-[width]" : "transition-none"
			}`}
			onTransitionEnd={endMotion}
			onTransitionCancel={endMotion}
		>
			<div className={`absolute inset-0 ${covering ? "" : "overflow-hidden"}`}>
				<div
					data-component="review-panel-surface"
					style={{ width: liveWidth, transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
					className={`absolute inset-y-0 right-0 flex pl-px ease-out motion-reduce:transition-none ${
						animating && motion === "expand" ? "transition-[width]" : "transition-none"
					} ${covering ? "shadow-[-8px_0_24px_var(--color-shadow)]" : ""}`}
					onTransitionEnd={endMotion}
					onTransitionCancel={endMotion}
				>
					{children}
				</div>
			</div>
			{(open || animating) && !expanded && <Divider control={divider} side="left" label="Resize review panel" />}
		</div>
	);
}
