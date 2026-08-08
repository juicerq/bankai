import { type } from "arktype";
import { THEME_PREFERENCES } from "@shared/theme";

export const windowBoundsSchema = type({
	x: "number",
	y: "number",
	width: "number",
	height: "number",
	maximized: "boolean",
});
export type WindowBounds = typeof windowBoundsSchema.infer;

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
	"+": "delete",
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

const storedServerSchema = type({
	token: "string",
	"port?": "number",
	"tailnet?": "boolean",
});
const vapidSchema = type({
	publicKey: "string",
	privateKey: "string",
});
export type VapidKeys = typeof vapidSchema.infer;

export const themeSchema = type.enumerated(...THEME_PREFERENCES);

export const settingsSchema = type({
	"windowBounds?": windowBoundsSchema,
	"layout?": layoutSchema,
	"harness?": harnessSchema,
	"server?": storedServerSchema,
	"vapid?": vapidSchema,
	"theme?": themeSchema,
});
export type SettingsValue = typeof settingsSchema.infer;
