import type { ReactNode, TransitionEvent } from "react";
import { Divider } from "@renderer/routes/-features/shared/interaction/divider";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-features/workspace/layout/layout-motion";
import type { useDivider } from "@renderer/routes/-features/shared/interaction/use-divider";

export type ReviewPanelMotion = "open" | "expand";

function panelFrameState({
	open,
	expanded,
	motion,
	resizing,
	width,
	liveWidth,
}: {
	open: boolean;
	expanded: boolean;
	motion: ReviewPanelMotion | undefined;
	resizing: boolean;
	width: number;
	liveWidth: string;
}) {
	const animating = motion !== undefined && !resizing;
	// The clip that hides the panel while it opens has to come off for it to reach
	// past the width it reserves, and stay off until it has docked back.
	const covering = open && (expanded || (animating && motion === "expand"));
	// Expanded, the row keeps holding the width the panel docks at: the surface
	// grows over the shells rather than taking their columns away from them.
	const openWidth = expanded ? `${width}px` : liveWidth;

	return { animating, covering, frameWidth: open ? openWidth : 0 };
}

function frameClassName(animating: boolean, motion: ReviewPanelMotion | undefined, covering: boolean) {
	const z = covering ? "z-20" : "";
	const transition = animating && motion === "open" ? "transition-[width]" : "transition-none";

	return `relative h-full shrink-0 ease-out motion-reduce:transition-none ${z} ${transition}`;
}

function clipClassName(covering: boolean) {
	return `absolute inset-0 ${covering ? "" : "overflow-hidden"}`;
}

function surfaceClassName(animating: boolean, motion: ReviewPanelMotion | undefined, covering: boolean) {
	const transition = animating && motion === "expand" ? "transition-[width]" : "transition-none";
	const shadow = covering ? "shadow-[-8px_0_24px_var(--color-shadow)]" : "";

	return `absolute inset-y-0 right-0 flex pl-px ease-out motion-reduce:transition-none ${transition} ${shadow}`;
}

function panelShowsDivider(open: boolean, animating: boolean, expanded: boolean) {
	return (open || animating) && !expanded;
}

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
	const { animating, covering, frameWidth } = panelFrameState({
		open,
		expanded,
		motion,
		resizing: divider.resizing,
		width,
		liveWidth,
	});
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
				width: frameWidth,
				transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms`,
			}}
			className={frameClassName(animating, motion, covering)}
			onTransitionEnd={endMotion}
			onTransitionCancel={endMotion}
		>
			<div className={clipClassName(covering)}>
				<div
					data-component="review-panel-surface"
					style={{ width: liveWidth, transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms` }}
					className={surfaceClassName(animating, motion, covering)}
					onTransitionEnd={endMotion}
					onTransitionCancel={endMotion}
				>
					{children}
				</div>
			</div>
			{panelShowsDivider(open, animating, expanded) && <Divider control={divider} side="left" label="Resize review panel" />}
		</div>
	);
}
