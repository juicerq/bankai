import type { ContinuityValue } from "@main/store/continuity";

export const SESSION_AUTO_ARCHIVE_MS = 3 * 24 * 60 * 60 * 1000;

export const CONTINUITY_IPC = {
	subscribe: "continuity:subscribe",
	changed: "continuity:changed",
} as const;

export interface ContinuityChangedEvent {
	value: ContinuityValue;
}

export interface BankaiContinuityApi {
	subscribe: () => void;
	onChanged: (listener: (event: ContinuityChangedEvent) => void) => () => void;
}

declare global {
	interface Window {
		bankaiContinuity: BankaiContinuityApi;
	}
}
