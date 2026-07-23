import type { ReactNode, TransitionEvent } from "react";
import { Divider } from "@renderer/routes/-components/divider";
import { LAYOUT_MOTION_DURATION_MS } from "@renderer/routes/-utils/layout-motion";
import type { useDivider } from "@renderer/routes/-utils/use-divider";

export function ReviewPanelFrame({
	open,
	animate,
	width,
	liveWidth,
	divider,
	onMotionEnd,
	children,
}: {
	open: boolean;
	animate: boolean;
	width: number;
	liveWidth: string;
	divider: ReturnType<typeof useDivider>;
	onMotionEnd: () => void;
	children: ReactNode;
}) {
	const animating = animate && !divider.resizing;
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
				<Divider control={divider} side="left" label="Resize review panel" />
			)}
		</div>
	);
}
