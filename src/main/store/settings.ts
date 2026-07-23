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
});
export type LayoutSettings = typeof layoutSchema.infer;

const settingsContract = type({ "windowBounds?": windowBoundsSchema, "layout?": layoutSchema });
export type SettingsValue = typeof settingsContract.infer;

const store = new Store({
	name: "settings",
	version: 2,
	contract: settingsContract,
	migrators: { 1: (raw) => {
		const previous = type({ "windowBounds?": windowBoundsSchema, "+": "delete" }).assert(raw);
		return previous;
	} },
	seed: (): SettingsValue => ({}),
});

export const Settings = {
	get: store.read.bind(store),
	update: (patch: SettingsValue) => store.mutate((current) => ({ ...current, ...patch })),
	updateLayout: async (patch: LayoutSettings): Promise<LayoutSettings> => {
		const next = await store.mutate((current) => ({ ...current, layout: { ...current.layout, ...patch } }));
		return next.layout ?? {};
	},
};
