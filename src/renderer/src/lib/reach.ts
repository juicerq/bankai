import { SERVER_HOST, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

async function resolveReach(): Promise<{ origin: string; token: string | undefined }> {
	const bridge = window.bankaiAuth;

	if (!bridge) {
		return {
			origin: window.location.origin,
			token: localStorage.getItem(SERVER_TOKEN_STORAGE_KEY) ?? undefined,
		};
	}

	const { port, token } = await bridge.getToken();

	return { origin: `http://${SERVER_HOST}:${port}`, token };
}

export const reach = resolveReach();
