import type { Server } from "node:http";
import { BankaiServer } from "@main/transport/server/bankai-server";
import { ServerListen } from "@main/transport/server/server-listen";
import { Reach } from "@main/transport/server/server-reach";

let listener: { server: Server; address: string } | undefined;

function tailnetListenerAddress(): string | undefined {
	return listener?.address;
}

async function openTailnetListener(address: string): Promise<void> {
	if (listener?.address === address) {
		return;
	}

	await closeTailnetListener();

	const server = BankaiServer.create();
	await ServerListen.on(server, { port: Reach.current().port, host: address });

	listener = { server, address };
}

async function closeTailnetListener(): Promise<void> {
	const current = listener;
	if (!current) {
		return;
	}

	listener = undefined;
	current.server.closeAllConnections();

	await new Promise<void>((resolve) => current.server.close(() => resolve()));
}

export const TailnetListener = {
	address: tailnetListenerAddress,
	open: openTailnetListener,
	close: closeTailnetListener,
};
