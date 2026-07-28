import { timingSafeEqual } from "node:crypto";
import { SERVER_HOST, SERVER_STREAM_PATH, SERVER_STREAM_TOKEN_PARAM } from "@shared/server";

const BEARER_PREFIX = "Bearer ";

export function authorizeRequest(authorization: string | undefined, token: string): boolean {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return false;
	}

	return authorizeToken(authorization.slice(BEARER_PREFIX.length), token);
}

export function authorizeUpgrade(target: string | undefined, token: string): boolean {
	const url = new URL(target ?? "/", `http://${SERVER_HOST}`);

	return url.pathname === SERVER_STREAM_PATH
		&& authorizeToken(url.searchParams.get(SERVER_STREAM_TOKEN_PARAM), token);
}

function authorizeToken(offered: string | null, token: string): boolean {
	if (offered === null) {
		return false;
	}

	const candidate = Buffer.from(offered);
	const expected = Buffer.from(token);

	return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
