import { type } from "arktype";
import { Store } from "@main/store/Store";

const themeSchema = type.enumerated("light", "dark", "system");

const windowBoundsSchema = type({
	x: "number",
	y: "number",
	width: "number",
	height: "number",
	maximized: "boolean",
});

const settingsContract = type({
	theme: themeSchema,
	"windowBounds?": windowBoundsSchema,
});

export const settingsUpdateSchema = type({
	"theme?": themeSchema,
	"windowBounds?": windowBoundsSchema,
});

export type Theme = typeof themeSchema.infer;
export type SettingsValue = typeof settingsContract.infer;
type SettingsUpdate = typeof settingsUpdateSchema.infer;

const store = new Store({
	name: "settings",
	version: 1,
	contract: settingsContract,
	migrators: {},
	seed: (): SettingsValue => ({ theme: "system" }),
});

export const Settings = {
	get: () => store.read(),
	update: (patch: SettingsUpdate) =>
		store.mutate((current) => ({ ...current, ...patch })),
};
