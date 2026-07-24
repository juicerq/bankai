export const UPDATE_IPC = {
	getPending: "update:get-pending",
	downloaded: "update:downloaded",
	install: "update:install",
} as const;

export interface UpdateDownloadedEvent {
	version: string;
}

export interface BankaiUpdateApi {
	getPending: () => Promise<UpdateDownloadedEvent | null>;
	onDownloaded: (listener: (event: UpdateDownloadedEvent) => void) => () => void;
	install: () => void;
}

declare global {
	interface Window {
		bankaiUpdate: BankaiUpdateApi;
	}
}
