export const UPDATE_IPC = {
	getPending: "update:get-pending",
	downloaded: "update:downloaded",
	install: "update:install",
	installCost: "update:install-cost",
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
	installCost: () => Promise<UpdateWorkload | null>;
	install: () => void;
}

declare global {
	interface Window {
		bankaiUpdate: BankaiUpdateApi;
	}
}
