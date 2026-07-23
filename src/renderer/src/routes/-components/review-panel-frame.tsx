import type { ReactNode, TransitionEvent } from "react";
import type { usePanelResize } from "@renderer/routes/-utils/use-panel-resize";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";

export function ReviewPanelFrame({
	open,
	animate,
	width,
	resizing,
	separatorProps,
	onMotionEnd,
	children,
}: {
	open: boolean;
	animate: boolean;
	width: number;
	resizing: boolean;
	separatorProps: ReturnType<typeof usePanelResize>["separatorProps"];
	onMotionEnd: () => void;
	children: ReactNode;
}) {
	const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget && event.propertyName === "width") {
			onMotionEnd();
		}
	};

	return (
		<div
			data-component="review-panel-frame"
			data-open={open}
			data-animating={animate}
			data-width={width}
			data-motion-duration={LAYOUT_MOTION_DURATION_MS}
			inert={!open}
			style={{
				width: open ? width : 0,
				transitionDuration: `${LAYOUT_MOTION_DURATION_MS}ms`,
			}}
			className={`relative h-full shrink-0 overflow-hidden ease-out motion-reduce:transition-none ${
				animate ? "transition-[width]" : ""
			}`}
			onTransitionEnd={handleTransitionEnd}
			onTransitionCancel={handleTransitionEnd}
		>
			<div style={{ width }} className="absolute inset-y-0 right-0 flex">
				<div
					role="separator"
					aria-orientation="vertical"
					aria-label="Resize review panel"
					className={`group relative w-px shrink-0 cursor-col-resize touch-none ${
						resizing ? "bg-primary" : "bg-outline group-hover:bg-outline-strong"
					}`}
					{...separatorProps}
				>
					<span className="absolute inset-y-0 -right-1 -left-1" />
				</div>
				{children}
			</div>
		</div>
	);
}
