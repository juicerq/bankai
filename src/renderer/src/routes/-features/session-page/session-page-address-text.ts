import { SessionPageUrl } from "@shared/session-page";

const WEB_SCHEME = /^https?:\/\//i;
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HOST_PORT = /^(?:\[::1\]|[a-z0-9.-]+):\d+(?:[/?#]|$)/i;
const SEARCH = "https://www.google.com/search?q=";

function probe(value: string) {
	try {
		return new URL(value);
	} catch {
		return;
	}
}

function upgrade(typed: string) {
	const parsed = probe(typed);

	if (!parsed) {
		return typed;
	}

	if (parsed.protocol === "http:" && !SessionPageUrl.isLoopback(parsed.hostname)) {
		parsed.protocol = "https:";
	}

	return parsed.href;
}

function resolve(draft: string) {
	const typed = draft.trim();

	if (!typed) {
		return;
	}

	if (WEB_SCHEME.test(typed)) {
		return SessionPageUrl.parse(upgrade(typed));
	}

	if (SCHEME.test(typed) && !HOST_PORT.test(typed)) {
		return SessionPageUrl.parse(typed);
	}

	const host = /\s/.test(typed) ? undefined : probe(`http://${typed}`);

	if (!host) {
		return SessionPageUrl.parse(`${SEARCH}${encodeURIComponent(typed)}`);
	}

	const local = SessionPageUrl.isLoopback(host.hostname);

	if (!local && !host.hostname.includes(".") && !host.port) {
		return SessionPageUrl.parse(`${SEARCH}${encodeURIComponent(typed)}`);
	}

	return SessionPageUrl.parse(`${local ? "http" : "https"}://${typed}`);
}

function describe(url: string) {
	const parsed = probe(url);

	if (!parsed) {
		return;
	}

	const path = parsed.pathname === "/" ? "" : parsed.pathname;

	return {
		host: parsed.host,
		path: `${path}${parsed.search}${parsed.hash}`,
		local: SessionPageUrl.isFile(url) || SessionPageUrl.isLoopback(parsed.hostname),
	};
}

export const SessionPageAddressText = {
	resolve,
	describe,
};
