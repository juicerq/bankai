export const UPDATE_IPC = {
	getPending: "update:get-pending",
	downloaded: "update:downloaded",
	install: "update:install",
	activeWork: "update:active-work",
} as const;

export interface UpdateDownloadedEvent {
	version: string;
}

export interface UpdateWorkload {
	kind: "agents" | "shells";
	count: number;
}

export interface BankaiUpdateApi {
	getPending: () => Promise<UpdateDownloadedEvent | null>;
	onDownloaded: (listener: (event: UpdateDownloadedEvent) => void) => () => void;
	countActiveWork: () => Promise<UpdateWorkload>;
	install: () => void;
}

declare global {
	interface Window {
		bankaiUpdate: BankaiUpdateApi;
	}
}
