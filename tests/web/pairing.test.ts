import "./register-dom";
import { streamTransport } from "./stream-transport";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { claimPairingToken, probeUnpaired } from "@renderer/lib/pairing";
import { refreshReach } from "@renderer/lib/reach";
import { reconnectDelay, StreamSocket } from "@renderer/lib/stream/socket";
import { streamStatus } from "@renderer/lib/stream/status";
import { pairingUrl, SERVER_RPC_PREFIX, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

const TOKEN = "a".repeat(64);
const PHONE_ORIGIN = "http://cachyos.tail74b3f3.ts.net/";

const releaseTransport = streamTransport.borrow();
const bridge = window.bankaiAuth;
const realFetch = globalThis.fetch;
const probed: string[] = [];
const sockets: StreamSocket[] = [];
let rpcStatus = 404;

async function settle(ticks = 6) {
	for (let tick = 0; tick < ticks; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

async function browserSocket() {
	const socket = new StreamSocket();
	sockets.push(socket);
	socket.on("activity", "changed", () => {});
	await settle();

	return socket;
}

afterAll(releaseTransport);

beforeEach(() => {
	streamTransport.reset();
	probed.length = 0;
	rpcStatus = 404;
	window.happyDOM.setURL(PHONE_ORIGIN);
	localStorage.clear();
	delete window.bankaiAuth;
	globalThis.fetch = Object.assign(
		(input: Parameters<typeof realFetch>[0]) => {
			probed.push(new Request(input).url);

			return Promise.resolve(new Response(null, { status: rpcStatus }));
		},
		{ preconnect: realFetch.preconnect },
	);
});

afterEach(async () => {
	for (const socket of sockets.splice(0)) {
		socket.dispose();
	}

	globalThis.fetch = realFetch;
	window.bankaiAuth = bridge;
	streamStatus.set("open");
	await refreshReach();
});

test("claims the token from the pairing fragment and wipes it from the address bar", () => {
	location.hash = new URL(pairingUrl({ host: "cachyos.tail74b3f3.ts.net", token: TOKEN })).hash;

	expect(claimPairingToken()).toBe(TOKEN);
	expect(localStorage.getItem(SERVER_TOKEN_STORAGE_KEY)).toBe(TOKEN);
	expect(location.hash).toBe("");
});

test("leaves a stored token alone when the address carries no fragment", () => {
	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, TOKEN);

	expect(claimPairingToken()).toBeUndefined();
	expect(localStorage.getItem(SERVER_TOKEN_STORAGE_KEY)).toBe(TOKEN);
});

test("a device with no token is unpaired without asking the server", async () => {
	expect(await probeUnpaired({ origin: "http://localhost", token: undefined })).toBe(true);
	expect(probed).toEqual([]);
});

test("a rejected token is unpaired and any other answer is not", async () => {
	rpcStatus = 401;
	expect(await probeUnpaired({ origin: "http://localhost", token: TOKEN })).toBe(true);
	expect(probed).toEqual([`http://localhost${SERVER_RPC_PREFIX}`]);

	rpcStatus = 404;
	expect(await probeUnpaired({ origin: "http://localhost", token: TOKEN })).toBe(false);
});

test("a phone whose token was revoked stops retrying instead of reconnecting forever", async () => {
	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, TOKEN);
	await refreshReach();
	rpcStatus = 401;
	const socket = await browserSocket();

	expect(streamStatus.get()).toBe("open");

	streamTransport.disconnect();
	await settle();

	expect(streamStatus.get()).toBe("unpaired");

	socket.retry();
	await new Promise((resolve) => setTimeout(resolve, reconnectDelay(0) + 50));

	expect(streamStatus.get()).toBe("unpaired");
	expect(streamTransport.connections).toBe(1);
});

test("a paired phone that merely lost the network keeps reconnecting", async () => {
	localStorage.setItem(SERVER_TOKEN_STORAGE_KEY, TOKEN);
	await refreshReach();
	await browserSocket();

	streamTransport.disconnect();
	await new Promise((resolve) => setTimeout(resolve, reconnectDelay(0) + 50));
	await settle();

	expect(streamStatus.get()).toBe("open");
	expect(streamTransport.connections).toBe(2);
});
