import type { ReactNode, TransitionEvent } from "react";
import type { usePanelResize } from "@renderer/routes/-utils/use-panel-resize";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";

export function ReviewPanelFrame({
	open,
	animate,
	width,
	liveWidth,
	resizing,
	separatorProps,
	onMotionEnd,
	children,
}: {
	open: boolean;
	animate: boolean;
	width: number;
	liveWidth: string;
	resizing: boolean;
	separatorProps: ReturnType<typeof usePanelResize>["separatorProps"];
	onMotionEnd: () => void;
	children: ReactNode;
}) {
	const animating = animate && !resizing;
	const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width") {
			onMotionEnd();
		}
	};

	return (
		<div
			data-component="review-panel-frame"
			data-open={open}
			data-animating={animating}
			data-width={width}
			data-motion-duration={LAYOUT_MOTION_DURATION_MS}
			inert={!open}
			style={{
				width: open ? liveWidth : 0,
				transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms`,
			}}
			className={`relative h-full shrink-0 ease-out motion-reduce:transition-none ${
				animating ? "transition-[width]" : "transition-none"
			}`}
			onTransitionEnd={handleTransitionEnd}
			onTransitionCancel={handleTransitionEnd}
		>
			<div className="absolute inset-0 overflow-hidden">
				<div style={{ width: liveWidth }} className="absolute inset-y-0 right-0 flex pl-px">
					{children}
				</div>
			</div>
			{(open || animating) && (
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize review panel"
					className={`absolute inset-y-0 left-0 z-10 w-px cursor-col-resize touch-none ${
						resizing ? "bg-primary" : "bg-outline hover:bg-primary"
					}`}
					{...separatorProps}
				>
					<span className="absolute inset-y-0 -right-1.5 -left-1.5" />
				</div>
			)}
		</div>
	);
}
