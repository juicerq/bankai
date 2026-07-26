import "./register-dom";
import { beforeEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import type { ContinuityValue } from "@main/store/continuity";
import { orpc } from "@renderer/lib/api";
import { installContinuityPush } from "@renderer/lib/continuity-push";
import type { BankaiContinuityApi, ContinuityChangedEvent } from "@shared/continuity";

const VALUE: ContinuityValue = {
	workspaces: [{ projectId: "p1", shells: [{ id: "s1", label: "Shell 1", createdAt: 1, lastTouchedAt: 7 }] }],
};

let listener: ((event: ContinuityChangedEvent) => void) | undefined;
let subscribed = 0;

const continuityApi: BankaiContinuityApi = {
	subscribe: () => {
		subscribed += 1;
	},
	onChanged: (next) => {
		listener = next;
		return () => {
			listener = undefined;
		};
	},
};

window.bankaiContinuity = continuityApi;

const { queryKey } = orpc.continuity.get.queryOptions();

function cached(client: QueryClient) {
	return client.getQueryData(queryKey);
}

beforeEach(() => {
	listener = undefined;
	subscribed = 0;
});

test("the first value arrives on the push channel with nothing fetched", () => {
	const queryClient = new QueryClient();
	installContinuityPush({ queryClient });
	listener?.({ value: VALUE });

	expect(subscribed).toBe(1);
	expect(cached(queryClient)).toEqual({ value: VALUE, failed: false });
});

test("a push overwrites what the loader seeded", () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, { value: { workspaces: [] }, failed: false });
	installContinuityPush({ queryClient });
	listener?.({ value: VALUE });

	expect(cached(queryClient)).toEqual({ value: VALUE, failed: false });
});

test("a push keeps the lost-sessions notice on screen", () => {
	const queryClient = new QueryClient();
	queryClient.setQueryData(queryKey, { value: { workspaces: [] }, failed: true });
	installContinuityPush({ queryClient });
	listener?.({ value: VALUE });

	expect(cached(queryClient)).toEqual({ value: VALUE, failed: true });
});

test("a stopped install takes its listener with it", () => {
	const queryClient = new QueryClient();
	installContinuityPush({ queryClient })();

	expect(listener).toBeUndefined();
});
