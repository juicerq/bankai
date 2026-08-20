import { type } from "arktype";
import { SessionPageUrl } from "@shared/session-page-url";

function canonicalUrl(value: string) {
	const parsed = SessionPageUrl.parse(value);

	if (!parsed) {
		throw new Error("Session page URL is not allowed");
	}

	return parsed;
}

const finiteNumber = type("number").narrow(Number.isFinite);
const positiveFiniteNumber = type("number > 0").narrow(Number.isFinite);
const shellId = type("string").narrow((value) => value.length > 0);
const sessionPageUrl = type("string")
	.narrow((value) => SessionPageUrl.parse(value) !== undefined)
	.pipe(canonicalUrl);
const bounds = type({
	x: finiteNumber,
	y: finiteNumber,
	width: positiveFiniteNumber,
	height: positiveFiniteNumber,
});
const navigation = type("number >= 0").narrow(Number.isInteger);
const presentation = type({
	shellId,
	url: sessionPageUrl,
	navigation,
	bounds,
});
const state = type({
	shellId: "string | null",
	url: "string | null",
	title: "string",
	canGoBack: "boolean",
	canGoForward: "boolean",
	loading: "boolean",
	failure: "string | null",
});
const shortcut = type({ action: type.enumerated(
	"toggle-review",
	"toggle-expanded",
	"toggle-page",
	"toggle-todos",
	"open-commands",
	"open-settings",
	"open-quick-open",
	"toggle-fullscreen",
	"archive-shell",
	"jump-waiting",
) })
	.or(type({ action: "'new-shell'", plain: "boolean" }))
	.or(type({ action: "'jump-row'", index: finiteNumber }));

export type SessionPagePresentation = typeof presentation.infer;
export type SessionPageState = typeof state.infer;
export type SessionPageShortcut = typeof shortcut.infer;

export interface BankaiSessionPageApi {
	present: (presentation: SessionPagePresentation | null) => Promise<void>;
	release: (shellId: string) => Promise<void>;
	goBack: () => Promise<void>;
	goForward: () => Promise<void>;
	reload: () => Promise<void>;
	openExternal: () => Promise<void>;
	clearData: () => Promise<void>;
	snapshot: () => Promise<string | null>;
	preview: () => Promise<string | null>;
	onState: (listener: (state: SessionPageState) => void) => () => void;
	onShortcut: (listener: (shortcut: SessionPageShortcut) => void) => () => void;
}

export const SessionPageSchemas = {
	url: sessionPageUrl,
	presentation,
	present: presentation.or("null"),
	shellId: type({ shellId }),
	state,
	shortcut,
	none: type("undefined"),
};

declare global {
	interface Window {
		bankaiSessionPage?: BankaiSessionPageApi;
	}
}
