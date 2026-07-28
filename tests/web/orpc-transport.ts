import "./register-dom";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { type } from "arktype";
import type { ContinuityValue } from "@main/store/continuity";
import type { HarnessSettings } from "@main/store/settings";
import { SERVER_DEFAULT_PORT, SERVER_RPC_PREFIX } from "@shared/server";

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

export interface ContinuityTransport {
	value: ContinuityValue;
	calls: { procedure: string; input: unknown }[];
}

let currentContinuity: ContinuityTransport | undefined;

export function setContinuityTransport(transport: ContinuityTransport) {
	currentContinuity = transport;
}

function requireContinuity() {
	if (!currentContinuity) {
		throw new Error("No continuity transport is installed");
	}

	return currentContinuity;
}

function recordContinuity(procedure: string) {
	return os.handler(({ input }) => {
		const transport = requireContinuity();
		transport.calls.push({ procedure, input });

		return transport.value;
	});
}

const router = {
	continuity: {
		get: os.handler(() => ({ value: requireContinuity().value, failed: false })),
		openShell: recordContinuity("openShell"),
		closeShell: recordContinuity("closeShell"),
		selectShell: recordContinuity("selectShell"),
		renameShell: recordContinuity("renameShell"),
		archiveShell: recordContinuity("archiveShell"),
		unarchiveShell: recordContinuity("unarchiveShell"),
	},
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

const TRANSPORT_TOKEN = "transport-token";

window.bankaiAuth = {
	getToken: () => Promise.resolve({ port: SERVER_DEFAULT_PORT, token: TRANSPORT_TOKEN }),
};

const realFetch = globalThis.fetch;

async function routeFetch(...args: Parameters<typeof realFetch>): Promise<Response> {
	const request = new Request(...args);

	if (!new URL(request.url).pathname.startsWith(SERVER_RPC_PREFIX)) {
		return realFetch(...args);
	}

	if (request.headers.get("authorization") !== `Bearer ${TRANSPORT_TOKEN}`) {
		return new Response(null, { status: 401 });
	}

	const { response } = await handler.handle(request, { prefix: SERVER_RPC_PREFIX });

	return response ?? new Response(null, { status: 404 });
}

globalThis.fetch = Object.assign(routeFetch, { preconnect: realFetch.preconnect });
