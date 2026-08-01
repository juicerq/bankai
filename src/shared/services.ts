export type ServiceStatus = "running" | "stopped" | "failed";

export interface ServiceState {
	commandId: string;
	projectId: string;
	status: ServiceStatus;
	pid?: number;
	startedAt?: number;
	exitCode?: number;
}

export interface ServicesChangedEvent {
	states: ServiceState[];
}

export interface BankaiServicesApi {
	subscribe: () => void;
	onChanged: (listener: (event: ServicesChangedEvent) => void) => () => void;
}
