export const SERVER_HOST = "127.0.0.1";
export const SERVER_DEFAULT_PORT = 4696;
export const SERVER_RPC_PREFIX = "/rpc";
export const SERVER_STREAM_PATH = "/stream";
export const SERVER_STREAM_TOKEN_PARAM = "token";
export const SERVER_TOKEN_BYTES = 32;
export const SERVER_TOKEN_STORAGE_KEY = "bankai.token";
export const SERVER_PAIRING_FRAGMENT_KEY = "token";

export function pairingUrl({ origin, token }: { origin: string; token: string }): string {
	return `${origin}/#${SERVER_PAIRING_FRAGMENT_KEY}=${token}`;
}

export const AUTH_IPC = {
	getToken: "auth:get-token",
} as const;

export interface ServerReach {
	port: number;
	token: string;
}

export interface BankaiAuthApi {
	getToken: () => Promise<ServerReach>;
}

declare global {
	interface Window {
		bankaiAuth?: BankaiAuthApi;
	}
}
