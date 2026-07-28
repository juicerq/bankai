import { claimPairingToken } from "@renderer/lib/pairing";
import { SERVER_HOST, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

export interface Reach {
	origin: string;
	token: string | undefined;
}

async function resolveReach(): Promise<Reach> {
	const bridge = window.bankaiAuth;

	if (!bridge) {
		return {
			origin: window.location.origin,
			token: claimPairingToken() ?? localStorage.getItem(SERVER_TOKEN_STORAGE_KEY) ?? undefined,
		};
	}

	const { port, token } = await bridge.getToken();

	return { origin: `http://${SERVER_HOST}:${port}`, token };
}

let current = resolveReach();

export function reach(): Promise<Reach> {
	return current;
}

export function refreshReach(): Promise<Reach> {
	current = resolveReach();

	return current;
}
