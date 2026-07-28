import type { ContinuityValue } from "@main/store/continuity";

export const SESSION_AUTO_ARCHIVE_MS = 3 * 24 * 60 * 60 * 1000;

export interface ContinuityChangedEvent {
	value: ContinuityValue;
}

export interface BankaiContinuityApi {
	subscribe: () => void;
	onChanged: (listener: (event: ContinuityChangedEvent) => void) => () => void;
}