import "./register-dom";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/message-port";

export type ReviewProcedure = "snapshot" | "files" | "file" | "fullFile";

interface PendingRequest {
	procedure: ReviewProcedure;
	input: unknown;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
}

export class ReviewTransport {
	readonly calls: { procedure: ReviewProcedure; input: unknown }[] = [];
	private readonly pending: PendingRequest[] = [];

	readonly request = (procedure: ReviewProcedure, input: unknown) => {
		this.calls.push({ procedure, input });
		return new Promise<unknown>((resolve, reject) => {
			this.pending.push({ procedure, input, resolve, reject });
		});
	};

	callsFor(procedure: ReviewProcedure) {
		return this.calls.filter((call) => call.procedure === procedure).map((call) => call.input);
	}

	pendingCount(procedure: ReviewProcedure) {
		return this.pending.filter((request) => request.procedure === procedure).length;
	}

	resolve(procedure: ReviewProcedure, value: unknown, match?: (input: unknown) => boolean) {
		this.take(procedure, match).resolve(value);
	}

	reject(procedure: ReviewProcedure, error: unknown, match?: (input: unknown) => boolean) {
		this.take(procedure, match).reject(error);
	}

	private take(procedure: ReviewProcedure, match?: (input: unknown) => boolean) {
		const index = this.pending.findIndex(
			(request) => request.procedure === procedure && (!match || match(request.input)),
		);
		if (index === -1) {
			throw new Error(`No pending ${procedure} request`);
		}

		const [request] = this.pending.splice(index, 1);
		if (!request) {
			throw new Error(`No pending ${procedure} request`);
		}

		return request;
	}
}

let currentTransport: ReviewTransport | undefined;

export function setReviewTransport(transport: ReviewTransport) {
	currentTransport = transport;
}

function requireTransport() {
	if (!currentTransport) {
		throw new Error("No review transport is installed");
	}

	return currentTransport;
}

const router = {
	review: {
		snapshot: os.handler(({ input }) => requireTransport().request("snapshot", input)),
		files: os.handler(({ input }) => requireTransport().request("files", input)),
		file: os.handler(({ input }) => requireTransport().request("file", input)),
		fullFile: os.handler(({ input }) => requireTransport().request("fullFile", input)),
	},
};

const handler = new RPCHandler(router);
const realPostMessage = window.postMessage.bind(window);

window.postMessage = ((message: unknown, targetOrigin: unknown, transfer?: unknown) => {
	const port = (transfer as MessagePort[] | undefined)?.[0];
	if (message === "start-orpc-client" && port) {
		handler.upgrade(port);
		port.start();
		return;
	}

	return realPostMessage(message as string, targetOrigin as string, transfer as Transferable[]);
}) as typeof window.postMessage;
