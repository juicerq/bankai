import "./register-dom";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/message-port";
import { type } from "arktype";
import type { HarnessSettings } from "@main/store/settings";

export type ReviewProcedure = "worktrees" | "snapshot" | "files" | "file" | "fullFile";

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

type BrowseDirectories = (path: string) => { path: string; directories: string[] };

let currentBrowse: BrowseDirectories | undefined;

export function setBrowseDirectories(browse: BrowseDirectories) {
	currentBrowse = browse;
}

function requireBrowse() {
	if (!currentBrowse) {
		throw new Error("No browse transport is installed");
	}

	return currentBrowse;
}

export interface HarnessTransport {
	harnesses: { id: string; label: string; available: boolean }[];
	harness: HarnessSettings;
	updates: HarnessSettings[];
	saveFailure?: string;
}

let currentHarness: HarnessTransport | undefined;

export function setHarnessTransport(transport: HarnessTransport) {
	currentHarness = transport;
}

function requireHarness() {
	if (!currentHarness) {
		throw new Error("No harness transport is installed");
	}

	return currentHarness;
}

const router = {
	settings: {
		listHarnesses: os.handler(() => requireHarness().harnesses),
		getHarness: os.handler(() => requireHarness().harness),
		updateHarness: os
			.input(type({ autostart: "boolean", id: "string", "args?": "string" }))
			.handler(({ input }) => {
				const transport = requireHarness();
				if (transport.saveFailure) {
					throw new Error(transport.saveFailure);
				}

				transport.updates.push(input);
				transport.harness = input;

				return input;
			}),
	},
	review: {
		worktrees: os.handler(({ input }) => requireTransport().request("worktrees", input)),
		snapshot: os.handler(({ input }) => requireTransport().request("snapshot", input)),
		files: os.handler(({ input }) => requireTransport().request("files", input)),
		file: os.handler(({ input }) => requireTransport().request("file", input)),
		fullFile: os.handler(({ input }) => requireTransport().request("fullFile", input)),
	},
	projects: {
		browse: os.input(type({ path: "string" })).handler(({ input }) => requireBrowse()(input.path)),
	},
};

const handler = new RPCHandler(router);
const realPostMessage = window.postMessage.bind(window);

function isMessagePort(value: Transferable | undefined): value is MessagePort {
	return typeof value === "object" && value !== null && "start" in value && "postMessage" in value;
}

window.postMessage = (
	message: unknown,
	targetOrigin?: string | WindowPostMessageOptions,
	transfer?: Transferable[],
) => {
	const port = transfer?.[0];
	if (message === "start-orpc-client" && isMessagePort(port)) {
		handler.upgrade(port);
		port.start();
		return;
	}

	if (typeof targetOrigin === "string") {
		realPostMessage(message, targetOrigin, transfer);
		return;
	}

	realPostMessage(message, targetOrigin);
};
