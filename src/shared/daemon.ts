import { type } from "arktype";

export const DAEMON_PROTOCOL_VERSION = 1;

export const DAEMON_ENV_FLAG = "BANKAI_DAEMON";

export const DAEMON_HELLO_PATH = "/daemon/hello";

export const daemonHelloSchema = type({
	protocolVersion: "number",
	appVersion: "string",
	pid: "number",
});

export type DaemonHello = typeof daemonHelloSchema.infer;
