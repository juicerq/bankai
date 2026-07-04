import { client } from "@renderer/lib/api";

export function installLoggerBridge(): void {
	window.addEventListener("error", (e) => {
		client.logger
			.error({
				message: e.message,
				stack: e.error instanceof Error ? e.error.stack : undefined,
				source: "window.error",
			})
			.catch(() => {});
	});

	window.addEventListener("unhandledrejection", (e) => {
		client.logger
			.error({
				message: e.reason instanceof Error ? e.reason.message : String(e.reason),
				stack: e.reason instanceof Error ? e.reason.stack : undefined,
				source: "unhandledrejection",
			})
			.catch(() => {});
	});
}
