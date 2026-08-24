import type { DaemonSkew } from "@shared/daemon";
import type { UpdateWorkload } from "@shared/update";

export const DAEMON_IPC = {
	getSkew: "daemon:get-skew",
	activeWork: "daemon:active-work",
	restart: "daemon:restart",
} as const;

export interface BankaiDaemonApi {
	getSkew: () => Promise<DaemonSkew | null>;
	countActiveWork: () => Promise<UpdateWorkload>;
	restart: () => Promise<void>;
}

declare global {
	interface Window {
		bankaiDaemon: BankaiDaemonApi;
	}
}
