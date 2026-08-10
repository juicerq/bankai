import { type } from "arktype";

function isLoopback(hostname: string) {
	if (hostname === "localhost" || hostname === "[::1]") {
		return true;
	}

	const octets = hostname.split(".");

	return octets.length === 4 && octets[0] === "127";
}

function parseUrl(input: unknown): string | undefined {
	if (typeof input !== "string") {
		return undefined;
	}

	let parsed: URL;

	try {
		parsed = new URL(input);
	} catch {
		return undefined;
	}

	if (parsed.username || parsed.password) {
		return undefined;
	}

	if (parsed.protocol === "https:") {
		return parsed.href;
	}

	if (parsed.protocol === "http:" && isLoopback(parsed.hostname)) {
		return parsed.href;
	}

	return undefined;
}

function canonicalUrl(value: string) {
	const parsed = parseUrl(value);

	if (!parsed) {
		throw new Error("Session page URL is not allowed");
	}

	return parsed;
}

const finiteNumber = type("number").narrow(Number.isFinite);
const positiveFiniteNumber = type("number > 0").narrow(Number.isFinite);
const shellId = type("string").narrow((value) => value.length > 0);
const sessionPageUrl = type("string")
	.narrow((value) => parseUrl(value) !== undefined)
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
	snapshot: () => Promise<string | null>;
	onState: (listener: (state: SessionPageState) => void) => () => void;
	onShortcut: (listener: (shortcut: SessionPageShortcut) => void) => () => void;
}

export const SessionPageSchemas = {
	presentation,
	present: presentation.or("null"),
	shellId: type({ shellId }),
	state,
	shortcut,
	none: type("undefined"),
};

export const SessionPageUrl = {
	parse: parseUrl,
	isLoopback,
};

declare global {
	interface Window {
		bankaiSessionPage?: BankaiSessionPageApi;
	}
}
