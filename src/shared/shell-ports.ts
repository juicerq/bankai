import { type } from "arktype";

const port = type("1 <= number <= 65535").narrow(Number.isInteger);
const detected = type({ "[string]": port.array() });

export type ShellPortsDetected = typeof detected.infer;

export interface BankaiShellPortsApi {
	onDetected: (listener: (detected: ShellPortsDetected) => void) => () => void;
}

export const ShellPortsSchemas = {
	detected,
};

declare global {
	interface Window {
		bankaiShellPorts?: BankaiShellPortsApi;
	}
}
