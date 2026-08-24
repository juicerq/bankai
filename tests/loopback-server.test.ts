import { createServer, type Server } from "node:http";
import { describe, expect, it } from "bun:test";
import { ServerAuth } from "@main/transport/server/server-auth";
import { ServerListen } from "@main/transport/server/server-listen";
import { SERVER_HOST, SERVER_STREAM_PATH, SERVER_TOKEN_BYTES } from "@shared/server";

const token = "a".repeat(SERVER_TOKEN_BYTES * 2);

describe("server authorization", () => {
	it("accepts the bearer token", () => {
		expect(ServerAuth.request(`Bearer ${token}`, token)).toBe(true);
	});

	it("rejects a request with no authorization header", () => {
		expect(ServerAuth.request(undefined, token)).toBe(false);
	});

	it("rejects a wrong token of the same length", () => {
		expect(ServerAuth.request(`Bearer ${"b".repeat(token.length)}`, token)).toBe(false);
	});

	it("rejects a token of a different length instead of throwing", () => {
		expect(ServerAuth.request("Bearer short", token)).toBe(false);
	});

	it("rejects a scheme other than bearer", () => {
		expect(ServerAuth.request(token, token)).toBe(false);
	});
});

describe("stream upgrade authorization", () => {
	it("accepts the stream path carrying the token", () => {
		expect(ServerAuth.upgrade(`${SERVER_STREAM_PATH}?token=${token}`, token)).toBe(true);
	});

	it("rejects the stream path with no token", () => {
		expect(ServerAuth.upgrade(SERVER_STREAM_PATH, token)).toBe(false);
	});

	it("rejects the stream path with a wrong token", () => {
		expect(ServerAuth.upgrade(`${SERVER_STREAM_PATH}?token=${"b".repeat(token.length)}`, token)).toBe(false);
	});

	it("rejects an upgrade aimed at any other path", () => {
		expect(ServerAuth.upgrade(`/rpc?token=${token}`, token)).toBe(false);
	});
});

function boundAddress(server: Server) {
	const address = server.address();

	if (typeof address !== "object" || address === null) {
		throw new Error("expected a bound TCP address");
	}

	return address;
}

describe("loopback listen", () => {
	it("binds the loopback interface only", async () => {
		const server = createServer();
		await ServerListen.on(server, { port: 0, host: SERVER_HOST });

		expect(boundAddress(server).address).toBe(SERVER_HOST);

		server.close();
	});

	it("fails on a busy port with the code the caller branches on", async () => {
		const taken = createServer();
		await ServerListen.on(taken, { port: 0, host: SERVER_HOST });

		const { port } = boundAddress(taken);
		const second = createServer();

		const failure: NodeJS.ErrnoException = await ServerListen.on(second, { port, host: SERVER_HOST })
			.then(() => {
				throw new Error("expected the busy port to reject");
			})
			.catch((err: NodeJS.ErrnoException) => err);

		expect(failure.code).toBe("EADDRINUSE");
		expect(String(failure)).toInclude(String(port));
		expect(second.listening).toBe(false);

		taken.close();
	});
});
