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

	if (parsed.protocol === "file:" && !parsed.host) {
		return parsed.href;
	}

	if (parsed.protocol === "https:") {
		return parsed.href;
	}

	if (parsed.protocol === "http:" && isLoopback(parsed.hostname)) {
		return parsed.href;
	}

	return undefined;
}

function isFile(value: string) {
	return value.startsWith("file:");
}

function parseNavigation({ from, to }: { from: string; to: string }) {
	const target = parseUrl(to);

	if (target && isFile(target) && !isFile(from)) {
		return;
	}

	return target;
}

export const SessionPageUrl = {
	parse: parseUrl,
	parseNavigation,
	isFile,
	isLoopback,
};
