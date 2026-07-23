import { type } from "arktype";
import { Store } from "@main/store/Store";

const windowBoundsSchema = type({
	x: "number",
	y: "number",
	width: "number",
	height: "number",
	maximized: "boolean",
});

const settingsContract = type({ "windowBounds?": windowBoundsSchema });
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
};
