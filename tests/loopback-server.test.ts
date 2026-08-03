import { createServer, type Server } from "node:http";
import { describe, expect, it } from "bun:test";
import { authorizeRequest, authorizeUpgrade } from "@main/transport/server/server-auth";
import { listenOn } from "@main/transport/server/server-listen";
import { SERVER_HOST, SERVER_STREAM_PATH, SERVER_TOKEN_BYTES } from "@shared/server";

const token = "a".repeat(SERVER_TOKEN_BYTES * 2);

describe("server authorization", () => {
	it("accepts the bearer token", () => {
		expect(authorizeRequest(`Bearer ${token}`, token)).toBe(true);
	});

	it("rejects a request with no authorization header", () => {
		expect(authorizeRequest(undefined, token)).toBe(false);
	});

	it("rejects a wrong token of the same length", () => {
		expect(authorizeRequest(`Bearer ${"b".repeat(token.length)}`, token)).toBe(false);
	});

	it("rejects a token of a different length instead of throwing", () => {
		expect(authorizeRequest("Bearer short", token)).toBe(false);
	});

	it("rejects a scheme other than bearer", () => {
		expect(authorizeRequest(token, token)).toBe(false);
	});
});

describe("stream upgrade authorization", () => {
	it("accepts the stream path carrying the token", () => {
		expect(authorizeUpgrade(`${SERVER_STREAM_PATH}?token=${token}`, token)).toBe(true);
	});

	it("rejects the stream path with no token", () => {
		expect(authorizeUpgrade(SERVER_STREAM_PATH, token)).toBe(false);
	});

	it("rejects the stream path with a wrong token", () => {
		expect(authorizeUpgrade(`${SERVER_STREAM_PATH}?token=${"b".repeat(token.length)}`, token)).toBe(false);
	});

	it("rejects an upgrade aimed at any other path", () => {
		expect(authorizeUpgrade(`/rpc?token=${token}`, token)).toBe(false);
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
		await listenOn(server, { port: 0, host: SERVER_HOST });

		expect(boundAddress(server).address).toBe(SERVER_HOST);

		server.close();
	});

	it("fails with the busy port named instead of moving to another one", async () => {
		const taken = createServer();
		await listenOn(taken, { port: 0, host: SERVER_HOST });

		const { port } = boundAddress(taken);
		const second = createServer();

		const failure = await listenOn(second, { port, host: SERVER_HOST }).catch((err) => String(err));

		expect(failure).toInclude(`port ${port}`);
		expect(second.listening).toBe(false);

		taken.close();
	});
});
