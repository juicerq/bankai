import type { AttentionReason } from "@shared/activity";

export const DESKTOP_IPC = {
	attention: "desktop:attention",
	pickDirectory: "desktop:pick-directory",
	openPath: "desktop:open-path",
	clipboardImage: "desktop:clipboard-image",
} as const;

export interface BankaiDesktopApi {
	attention: (reason: AttentionReason, count: number) => void;
	pickDirectory: () => Promise<string | null>;
	openPath: (path: string) => Promise<void>;
	clipboardImage: () => Promise<string | null>;
}

declare global {
	interface Window {
		bankaiDesktop?: BankaiDesktopApi;
	}
}
