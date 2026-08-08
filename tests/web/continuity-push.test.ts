import "./register-dom";
import { streamTransport } from "./stream-transport";
import { beforeEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { ContinuityValue } from "@shared/continuity";
import { orpc } from "@renderer/lib/api";
import { installContinuityPush } from "@renderer/lib/continuity-push";

const VALUE: ContinuityValue = {
	workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, lastTouchedAt: 7 }] }],
};

const { queryKey } = orpc.continuity.get.queryOptions();

function cached(client: QueryClient) {
	return client.getQueryData(queryKey);
}

async function connected() {
	for (let tick = 0; tick < 3; tick++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

beforeEach(() => {
	streamTransport.reset();
});

test("the first value arrives on the push channel with nothing fetched", async () => {
	const queryClient = new QueryClient();
	installContinuityPush({ queryClient });
	await connected();
	streamTransport.push("continuity", "changed", { value: VALUE });

	expect(streamTransport.payloads("continuity", "subscribe")).toHaveLength(1);
	expect(cached(queryClient)).toEqual({ value: VALUE, failed: false });
});

test("a push overwrites what the loader seeded", async () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, { value: { workspaces: [] }, failed: false });
	installContinuityPush({ queryClient });
	await connected();
	streamTransport.push("continuity", "changed", { value: VALUE });

	expect(cached(queryClient)).toEqual({ value: VALUE, failed: false });
});

test("a push keeps the lost-sessions notice on screen", async () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, { value: { workspaces: [] }, failed: true });
	installContinuityPush({ queryClient });
	await connected();
	streamTransport.push("continuity", "changed", { value: VALUE });

	expect(cached(queryClient)).toEqual({ value: VALUE, failed: true });
});

test("a stopped install stops taking pushes", async () => {
	const queryClient = new QueryClient();
	installContinuityPush({ queryClient })();
	await connected();
	streamTransport.push("continuity", "changed", { value: VALUE });

	expect(cached(queryClient)).toBeUndefined();
});
