import { randomBytes } from "node:crypto";
import { type } from "arktype";
import { Store } from "@main/store/Store";
import { DEFAULT_LIVE_TRACE, DEFAULT_SESSION_NAMING } from "@shared/activity";
import { SERVER_DEFAULT_PORT, SERVER_TOKEN_BYTES, type ServerReach } from "@shared/server";

const windowBoundsSchema = type({
	x: "number",
	y: "number",
	width: "number",
	height: "number",
	maximized: "boolean",
});

export const layoutSchema = type({
	"railWidth?": "number",
	"diffWidth?": "number",
	"treeWidth?": "number",
	"fullscreen?": "boolean",
	"reviewOpen?": "boolean",
	"treeOpen?": "boolean",
	"projectsOpen?": "boolean",
});
export type LayoutSettings = typeof layoutSchema.infer;

export const harnessSchema = type({
	autostart: "boolean",
	id: "string",
	"args?": "string",
	"liveTrace?": "boolean",
	"naming?": "boolean",
});
export type HarnessSettings = typeof harnessSchema.infer;

export function liveTraceEnabled(harness: HarnessSettings | undefined): boolean {
	return harness?.liveTrace ?? DEFAULT_LIVE_TRACE;
}

export function sessionNamingEnabled(harness: HarnessSettings | undefined): boolean {
	return harness?.naming ?? DEFAULT_SESSION_NAMING;
}

const serverSchema = type({
	token: "string",
	"port?": "number",
});

const settingsContract = type({
	"windowBounds?": windowBoundsSchema,
	"layout?": layoutSchema,
	"harness?": harnessSchema,
	"server?": serverSchema,
});
export type SettingsValue = typeof settingsContract.infer;

const store = new Store({
	name: "settings",
	version: 3,
	contract: settingsContract,
	migrators: {
		1: (raw) => {
			const previous = type({ "windowBounds?": windowBoundsSchema, "+": "delete" }).assert(raw);
			return previous;
		},
		2: (raw) => raw,
	},
	seed: (): SettingsValue => ({}),
});

export const Settings = {
	get: store.read.bind(store),
	update: (patch: SettingsValue) => store.mutate((current) => ({ ...current, ...patch })),
	updateLayout: async (patch: LayoutSettings): Promise<LayoutSettings> => {
		const next = await store.mutate((current) => ({ ...current, layout: { ...current.layout, ...patch } }));
		return next.layout ?? {};
	},
	updateHarness: async (harness: HarnessSettings): Promise<HarnessSettings> => {
		await store.mutate((current) => ({ ...current, harness }));
		return harness;
	},
	ensureServer: async (): Promise<ServerReach> => {
		const current = await store.read();
		const server = current.server ?? { token: randomBytes(SERVER_TOKEN_BYTES).toString("hex") };

		if (!current.server) {
			await store.mutate((value) => ({ ...value, server }));
		}

		return { port: server.port ?? SERVER_DEFAULT_PORT, token: server.token };
	},
};
