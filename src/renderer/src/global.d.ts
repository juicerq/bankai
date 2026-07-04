import type { PtyBridge } from "@shared/pty";

declare global {
	interface Window {
		pty: PtyBridge;
	}
}
