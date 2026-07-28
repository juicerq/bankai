import { SERVER_PAIRING_FRAGMENT_KEY, SERVER_RPC_PREFIX, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

export function claimPairingToken(): string | undefined {
	const offered = new URLSearchParams(location.hash.slice(1)).get(SERVER_PAIRING_FRAGMENT_KEY);
	if (!offered) {
		return undefined;
	}

	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, offered);
	history.replaceState(null, "", `${location.pathname}${location.search}`);

	return offered;
}

function pairingOffer(scanned: string): { origin: string; token: string } | undefined {
	const offered = URL.parse(scanned);
	if (!offered) {
		return undefined;
	}

	const token = new URLSearchParams(offered.hash.slice(1)).get(SERVER_PAIRING_FRAGMENT_KEY);
	if (!token) {
		return undefined;
	}

	return { origin: offered.origin, token };
}

export function acceptPairingOffer(scanned: string): boolean {
	const offer = pairingOffer(scanned);
	if (!offer) {
		return false;
	}

	if (offer.origin !== location.origin) {
		location.href = scanned;

		return true;
	}

	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, offer.token);
	location.reload();

	return true;
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
