import type { Server } from "node:http";
import { createBankaiServer } from "@main/server";
import { listenOn } from "@main/server/listen";
import { serverReach } from "@main/server/reach";

let listener: { server: Server; address: string } | undefined;

export function tailnetListenerAddress(): string | undefined {
	return listener?.address;
}

export async function openTailnetListener(address: string): Promise<void> {
	if (listener?.address === address) {
		return;
	}

	await closeTailnetListener();

	const server = createBankaiServer();
	await listenOn(server, { port: serverReach().port, host: address });

	listener = { server, address };
}

export async function closeTailnetListener(): Promise<void> {
	const current = listener;
	if (!current) {
		return;
	}

	listener = undefined;
	current.server.closeAllConnections();

	await new Promise<void>((resolve) => current.server.close(() => resolve()));
}
