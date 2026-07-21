import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/message-port";
import { ipcMain } from "electron";
import { router } from "@main/router";

const handler = new RPCHandler(router, {
	interceptors: [
		onError((error) => {
			console.error("[orpc]", error);
		}),
	],
});

export function startOrpcServer() {
	ipcMain.on("start-orpc-server", (event) => {
		const [port] = event.ports;
		if (!port) return;
		handler.upgrade(port);
		port.start();
	});
}
