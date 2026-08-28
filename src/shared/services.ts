import { type } from "arktype";

export type ServiceStatus = "running" | "stopped" | "failed";

const serviceStateSchema = type({
	commandId: "string",
	projectId: "string",
	status: "'running' | 'stopped' | 'failed'",
	"pid?": "number",
	"startedAt?": "number",
	"exitCode?": "number",
});

export const servicesChangedEventSchema = type({ states: serviceStateSchema.array() });

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
