import type { PtyBridge } from "@shared/pty";
import type { ReviewBridge } from "@shared/review";

declare global {
	interface Window {
		pty: PtyBridge;
		review: ReviewBridge;
	}
}
