import { type } from "arktype";
import { Store } from "@main/store/store";
import {
	type SettingsValue,
	settingsSchema,
	windowBoundsSchema,
} from "@shared/settings";
import { DEFAULT_THEME } from "@shared/theme";

const singleHarnessSchema = type({
	autostart: "boolean",
	id: "string",
	"args?": "string",
	"liveTrace?": "boolean",
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

function withStoredTheme(raw: unknown): unknown {
	if (typeof raw !== "object" || raw === null) {
		return raw;
	}

	return { ...raw, theme: DEFAULT_THEME };
}

const store = new Store({
	name: "settings",
	version: 7,
	contract: settingsSchema,
	migrators: {
		1: (raw) => type({ "windowBounds?": windowBoundsSchema, "+": "delete" }).assert(raw),
		2: (raw) => raw,
		3: (raw) => raw,
		4: withHarnessProfiles,
		5: (raw) => raw,
		6: withStoredTheme,
	},
	seed: (): SettingsValue => ({}),
});

export const SettingsStore = {
	read: store.read.bind(store),
	mutate: store.mutate.bind(store),
};
