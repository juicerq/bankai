import "./register-dom";
import { TEST_AUTH_TOKEN } from "./auth-bridge";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { type } from "arktype";
import { commandDraftSchema, type ProjectCommand } from "@main/store/project-commands";
import type { ContinuityValue } from "@main/store/continuity";
import type { MobileAccessStatus } from "@main/infra/tailscale/tailscale-access";
import { type HarnessSettings, harnessSchema } from "@main/store/settings";
import { SERVER_RPC_PREFIX } from "@shared/server";
import type { ServiceState, ServiceStatus } from "@shared/services";

export type ReviewProcedure = "worktrees" | "snapshot" | "files" | "file" | "fullFile" | "browseFiles" | "browseFile";

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
	harnesses: { id: string; label: string; conversation: boolean; available: boolean }[];
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

export interface MobileTransport {
	access: MobileAccessStatus;
	exposeCalls: boolean[];
	plainOnly?: boolean;
	regenerations: number;
}

let currentMobile: MobileTransport | undefined;

export function setMobileTransport(transport: MobileTransport) {
	currentMobile = transport;
}

function requireMobile() {
	if (!currentMobile) {
		throw new Error("No mobile transport is installed");
	}

	return currentMobile;
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

export interface PushTransport {
	publicKey: string;
	subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[];
}

let currentPush: PushTransport | undefined;

export function setPushTransport(transport: PushTransport) {
	currentPush = transport;
}

function requirePush() {
	if (!currentPush) {
		throw new Error("No push transport is installed");
	}

	return currentPush;
}

export interface CommandsTransport {
	commands: ProjectCommand[];
	listFailure?: string;
	saveFailure?: string;
}

let currentCommands: CommandsTransport | undefined;

export function setCommandsTransport(transport: CommandsTransport) {
	currentCommands = transport;
}

function requireCommands() {
	if (!currentCommands) {
		throw new Error("No commands transport is installed");
	}

	return currentCommands;
}

function requireWritableCommands() {
	const transport = requireCommands();
	if (transport.saveFailure) {
		throw new Error(transport.saveFailure);
	}

	return transport;
}

export interface ServicesTransport {
	states: ServiceState[];
	calls: { procedure: "start" | "stop"; commandId: string }[];
}

let currentServices: ServicesTransport | undefined;

export function setServicesTransport(transport: ServicesTransport) {
	currentServices = transport;
}

function recordService(procedure: "start" | "stop", status: ServiceStatus) {
	return os.input(type({ commandId: "string" })).handler(({ input }) => {
		if (!currentServices) {
			return;
		}

		currentServices.calls.push({ procedure, commandId: input.commandId });
		currentServices.states = [
			...currentServices.states.filter((state) => state.commandId !== input.commandId),
			{ commandId: input.commandId, projectId: "p1", status },
		];
	});
}

function recordContinuity(procedure: string) {
	return os.handler(({ input }) => {
		const transport = requireContinuity();
		transport.calls.push({ procedure, input });

		return transport.value;
	});
}

const router = {
	commands: {
		list: os.input(type({ projectId: "string" })).handler(({ input }) => {
			const transport = requireCommands();
			if (transport.listFailure) {
				throw new Error(transport.listFailure);
			}

			return transport.commands.filter((command) => command.projectId === input.projectId);
		}),
		add: os
			.input(commandDraftSchema.and({ projectId: "string" }))
			.handler(({ input }) => {
				const transport = requireWritableCommands();
				const command = { id: `c${transport.commands.length + 1}`, createdAt: 0, ...input };
				transport.commands = [...transport.commands, command];

				return command;
			}),
		update: os
			.input(commandDraftSchema.and({ id: "string" }))
			.handler(({ input }) => {
				const transport = requireWritableCommands();
				transport.commands = transport.commands.map((command) =>
					command.id === input.id ? { ...command, ...input } : command
				);

				return transport.commands.find((command) => command.id === input.id);
			}),
		remove: os.input(type({ id: "string" })).handler(({ input }) => {
			const transport = requireWritableCommands();
			transport.commands = transport.commands.filter((command) => command.id !== input.id);
		}),
	},
	services: {
		list: os.handler(() => currentServices?.states ?? []),
		start: recordService("start", "running"),
		stop: recordService("stop", "stopped"),
	},
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
		updateHarness: os.input(harnessSchema).handler(({ input }) => {
			const transport = requireHarness();
			if (transport.saveFailure) {
				throw new Error(transport.saveFailure);
			}

				transport.updates.push(input);
				transport.harness = input;

				return input;
			}),
	},
	mobile: {
		getAccess: os.handler(() => requireMobile().access),
		setExposed: os.input(type({ enabled: "boolean" })).handler(({ input }) => {
			const transport = requireMobile();
			transport.exposeCalls.push(input.enabled);
			const plain = !!transport.plainOnly;
			transport.access = {
				...transport.access,
				exposed: input.enabled && !plain,
				tailnetOpen: input.enabled && plain,
			};

			return transport.access;
		}),
		regenerateToken: os.handler(() => {
			const transport = requireMobile();
			transport.regenerations += 1;
			transport.access = { ...transport.access, url: `${transport.access.url}-again` };

			return transport.access;
		}),
	},
	review: {
		worktrees: os.handler(({ input }) => requireTransport().request("worktrees", input)),
		snapshot: os.handler(({ input }) => requireTransport().request("snapshot", input)),
		files: os.handler(({ input }) => requireTransport().request("files", input)),
		file: os.handler(({ input }) => requireTransport().request("file", input)),
		fullFile: os.handler(({ input }) => requireTransport().request("fullFile", input)),
		browseFiles: os.handler(({ input }) => requireTransport().request("browseFiles", input)),
		browseFile: os.handler(({ input }) => requireTransport().request("browseFile", input)),
	},
	projects: {
		browse: os.input(type({ path: "string" })).handler(({ input }) => requireBrowse()(input.path)),
	},
	push: {
		getPublicKey: os.handler(() => requirePush().publicKey),
		subscribe: os
			.input(type({ endpoint: "string", keys: { p256dh: "string", auth: "string" } }))
			.handler(({ input }) => {
				requirePush().subscriptions.push(input);
			}),
	},
};

const handler = new RPCHandler(router);

const realFetch = globalThis.fetch;

async function routeFetch(...args: Parameters<typeof realFetch>): Promise<Response> {
	const request = new Request(...args);

	if (!new URL(request.url).pathname.startsWith(SERVER_RPC_PREFIX)) {
		return realFetch(...args);
	}

	if (request.headers.get("authorization") !== `Bearer ${TEST_AUTH_TOKEN}`) {
		return new Response(null, { status: 401 });
	}

	const { response } = await handler.handle(request, { prefix: SERVER_RPC_PREFIX });

	return response ?? new Response(null, { status: 404 });
}

globalThis.fetch = Object.assign(routeFetch, { preconnect: realFetch.preconnect });
