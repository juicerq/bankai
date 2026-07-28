import { timingSafeEqual } from "node:crypto";

const BEARER_PREFIX = "Bearer ";

export function authorizeRequest(authorization: string | undefined, token: string): boolean {
	if (!authorization?.startsWith(BEARER_PREFIX)) {
		return false;
	}

	const offered = Buffer.from(authorization.slice(BEARER_PREFIX.length));
	const expected = Buffer.from(token);

	return offered.length === expected.length && timingSafeEqual(offered, expected);
}
