import { randomBytes } from "node:crypto";
import { type } from "arktype";
import { Store } from "@main/store/Store";
import { DEFAULT_HARNESS_HOOKS, DEFAULT_SESSION_NAMING } from "@shared/activity";
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
	"reviewExpanded?": "boolean",
	"treeOpen?": "boolean",
	"projectsOpen?": "boolean",
});
export type LayoutSettings = typeof layoutSchema.infer;

const harnessProfileSchema = type({
	"args?": "string",
	"hooks?": "boolean",
	"naming?": "boolean",
});
export type HarnessProfile = typeof harnessProfileSchema.infer;

const harnessProfilesSchema = type("object").pipe((raw): Record<string, HarnessProfile> => {
	const profiles: Record<string, HarnessProfile> = {};

	for (const [harnessId, value] of Object.entries(raw)) {
		const profile = harnessProfileSchema(value);
		if (!(profile instanceof type.errors)) {
			profiles[harnessId] = profile;
		}
	}

	return profiles;
});

export const harnessSchema = type({
	autostart: "boolean",
	id: "string",
	"profiles?": harnessProfilesSchema,
});
export type HarnessSettings = typeof harnessSchema.infer;

export function harnessProfile(harness: HarnessSettings | undefined, harnessId: string): HarnessProfile {
	return harness?.profiles?.[harnessId] ?? {};
}

export function harnessHooksEnabled(profile: HarnessProfile): boolean {
	return profile.hooks ?? DEFAULT_HARNESS_HOOKS;
}

export function sessionNamingEnabled(profile: HarnessProfile): boolean {
	return profile.naming ?? DEFAULT_SESSION_NAMING;
}

const serverSchema = type({
	token: "string",
	"port?": "number",
	"tailnet?": "boolean",
});

export function serverPort(stored: number | undefined): number {
	const fromEnv = process.env.SERVER_PORT;
	if (!fromEnv) {
		return stored ?? SERVER_DEFAULT_PORT;
	}

	const port = Number(fromEnv);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`SERVER_PORT must be a port number between 1 and 65535, got "${fromEnv}"`);
	}

	return port;
}

const vapidSchema = type({
	publicKey: "string",
	privateKey: "string",
});
export type VapidKeys = typeof vapidSchema.infer;

const settingsContract = type({
	"windowBounds?": windowBoundsSchema,
	"layout?": layoutSchema,
	"harness?": harnessSchema,
	"server?": serverSchema,
	"vapid?": vapidSchema,
});
export type SettingsValue = typeof settingsContract.infer;

const singleHarnessSchema = type({
	autostart: "boolean",
	id: "string",
	"args?": "string",
	"liveTrace?": "boolean",
	"naming?": "boolean",
});

function withHarnessProfiles(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null || !("harness" in raw)) {
		return raw;
	}

	const { harness: _dropped, ...rest } = raw;
	const previous = singleHarnessSchema(raw.harness);
	if (previous instanceof type.errors) {
		return rest;
	}

	const { autostart, id, ...profile } = previous;

	return { ...rest, harness: { autostart, id, profiles: { [id]: profile } } };
}

const tracedProfileSchema = type({
	"args?": "string",
	"liveTrace?": "boolean",
	"naming?": "boolean",
}).pipe(({ liveTrace, ...profile }): HarnessProfile => ({
	...profile,
	...(liveTrace !== undefined && { hooks: liveTrace }),
}));

const tracedHarnessSchema = type({
	autostart: "boolean",
	id: "string",
	"profiles?": type("object").pipe((raw): Record<string, HarnessProfile> => {
		const profiles: Record<string, HarnessProfile> = {};

		for (const [harnessId, value] of Object.entries(raw)) {
			const profile = tracedProfileSchema(value);
			if (!(profile instanceof type.errors)) {
				profiles[harnessId] = profile;
			}
		}

		return profiles;
	}),
});

function withHarnessHooks(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null || !("harness" in raw)) {
		return raw;
	}

	const harness = tracedHarnessSchema(raw.harness);
	if (harness instanceof type.errors) {
		const { harness: _dropped, ...rest } = raw;

		return rest;
	}

	return { ...raw, harness };
}

const store = new Store({
	name: "settings",
	version: 6,
	contract: settingsContract,
	migrators: {
		1: (raw) => {
			const previous = type({ "windowBounds?": windowBoundsSchema, "+": "delete" }).assert(raw);
			return previous;
		},
		2: (raw) => raw,
		3: (raw) => raw,
		4: withHarnessProfiles,
		5: withHarnessHooks,
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
		const server = current.server ?? { token: mintServerToken() };

		if (!current.server) {
			await store.mutate((value) => ({ ...value, server }));
		}

		return { port: serverPort(server.port), token: server.token };
	},
	regenerateServerToken: async (): Promise<ServerReach> => {
		const next = await store.mutate((current) => ({
			...current,
			server: { ...current.server, token: mintServerToken() },
		}));

		if (!next.server) {
			throw new Error("The regenerated server token was not stored");
		}

		return { port: serverPort(next.server.port), token: next.server.token };
	},
	tailnetAccess: async (): Promise<boolean> => !!(await store.read()).server?.tailnet,
	setTailnetAccess: async (tailnet: boolean): Promise<void> => {
		await store.mutate((current) => {
			if (!current.server) {
				throw new Error("The server has no stored token to attach tailnet access to");
			}

			return { ...current, server: { ...current.server, tailnet } };
		});
	},
	ensureVapid: async (mint: () => VapidKeys): Promise<VapidKeys> => {
		const current = await store.read();
		if (current.vapid) {
			return current.vapid;
		}

		const vapid = mint();
		await store.mutate((value) => ({ ...value, vapid }));

		return vapid;
	},
};

function mintServerToken(): string {
	return randomBytes(SERVER_TOKEN_BYTES).toString("hex");
}
