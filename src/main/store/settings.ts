import { type } from "arktype";
import { Store } from "@main/store/Store";

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

export const harnessSchema = type({ autostart: "boolean", id: "string" });
export type HarnessSettings = typeof harnessSchema.infer;

const settingsContract = type({
	"windowBounds?": windowBoundsSchema,
	"layout?": layoutSchema,
	"harness?": harnessSchema,
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
};
