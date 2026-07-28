import { SERVER_PAIRING_FRAGMENT_KEY, SERVER_RPC_PREFIX, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

export function pairable(): boolean {
	return window.bankaiAuth === undefined;
}

export function claimPairingToken(): string | undefined {
	const offered = new URLSearchParams(location.hash.slice(1)).get(SERVER_PAIRING_FRAGMENT_KEY);
	if (!offered) {
		return undefined;
	}

	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, offered);
	history.replaceState(null, "", `${location.pathname}${location.search}`);

	return offered;
}

export async function probeUnpaired({
	origin,
	token,
}: {
	origin: string;
	token: string | undefined;
}): Promise<boolean> {
	if (!token) {
		return true;
	}

	const response = await fetch(`${origin}${SERVER_RPC_PREFIX}`, {
		headers: { authorization: `Bearer ${token}` },
	}).catch(() => {});

	return response?.status === 401;
}
