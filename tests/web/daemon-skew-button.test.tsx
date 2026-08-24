import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DaemonSkew } from "@shared/daemon";
import type { BankaiDaemonApi } from "@shared/daemon-ipc";
import type { UpdateWorkload } from "@shared/update";
import { DaemonSkewButton } from "@renderer/routes/-features/app/daemon/daemon-skew-button";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";

const OUTDATED: DaemonSkew = { daemonVersion: "0.2.74", appVersion: "0.2.75" };

let skew: DaemonSkew | null;
const countActiveWork = jest.fn<() => Promise<UpdateWorkload>>();
const restart = jest.fn(async () => {});
const reload = jest.fn();
const realLocation = Object.getOwnPropertyDescriptor(window, "location");

async function mount() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	render(
		<QueryClientProvider client={queryClient}>
			<DaemonSkewButton />
		</QueryClientProvider>,
	);

	if (skew) {
		await waitFor(() => expect(query("daemon-skew-button")).not.toBeNull());
	}
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

beforeEach(() => {
	skew = null;
	countActiveWork.mockReset();
	countActiveWork.mockResolvedValue({ kind: "agents", count: 0 });
	restart.mockClear();
	reload.mockClear();
	const api: BankaiDaemonApi = {
		getSkew: async () => skew,
		countActiveWork,
		restart,
	};
	window.bankaiDaemon = api;
	Object.defineProperty(window, "location", {
		configurable: true,
		value: { reload },
	});
});

afterEach(() => {
	cleanup();

	if (realLocation) {
		Object.defineProperty(window, "location", realLocation);
	}
});

describe("Daemon skew button", () => {
	test("stays hidden while the core speaks for this build", async () => {
		await mount();
		await act(async () => {});

		expect(query("daemon-skew-button")).toBeNull();
	});

	test("names the version the core still runs", async () => {
		skew = OUTDATED;

		await mount();

		expect(slot(get("daemon-skew-button"), "daemon-skew-version").textContent).toBe("CORE v0.2.74");
	});

	test("restarts the core without asking when nothing is running", async () => {
		skew = OUTDATED;
		await mount();

		await click(get("daemon-skew-button"));

		expect(query("daemon-restart-confirm")).toBeNull();
		expect(restart).toHaveBeenCalledTimes(1);
	});

	test("reloads the window onto the new core, instead of leaving a stale one", async () => {
		skew = OUTDATED;
		await mount();

		await click(get("daemon-skew-button"));
		await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
	});

	test("asks first, naming what the restart costs, while agents are mid-turn", async () => {
		skew = OUTDATED;
		countActiveWork.mockResolvedValue({ kind: "agents", count: 3 });
		await mount();

		await click(get("daemon-skew-button"));

		expect(restart).not.toHaveBeenCalled();
		expect(slot(get("daemon-restart-confirm"), "confirm-message").textContent).toContain("stops 3 agents mid-turn");
	});

	test("still offers the restart when the core will not say what it is running", async () => {
		skew = OUTDATED;
		countActiveWork.mockRejectedValue(new Error("the core is unreachable"));
		await mount();

		await click(get("daemon-skew-button"));

		expect(restart).not.toHaveBeenCalled();
		expect(slot(get("daemon-restart-confirm"), "confirm-message").textContent).toContain(
			"stops whatever the core is running",
		);
	});

	test("confirming an unknown cost restarts the core anyway", async () => {
		skew = OUTDATED;
		countActiveWork.mockRejectedValue(new Error("the core is unreachable"));
		await mount();
		await click(get("daemon-skew-button"));

		await click(slot(get("daemon-restart-confirm"), "confirm-accept"));

		expect(restart).toHaveBeenCalledTimes(1);
	});

	test("confirming restarts the core and closes the dialog", async () => {
		skew = OUTDATED;
		countActiveWork.mockResolvedValue({ kind: "shells", count: 2 });
		await mount();
		await click(get("daemon-skew-button"));

		await click(slot(get("daemon-restart-confirm"), "confirm-accept"));

		expect(query("daemon-restart-confirm")).toBeNull();
		expect(restart).toHaveBeenCalledTimes(1);
	});

	test("cancelling keeps the old core running", async () => {
		skew = OUTDATED;
		countActiveWork.mockResolvedValue({ kind: "agents", count: 2 });
		await mount();
		await click(get("daemon-skew-button"));

		await click(slot(get("daemon-restart-confirm"), "confirm-cancel"));

		expect(query("daemon-restart-confirm")).toBeNull();
		expect(restart).not.toHaveBeenCalled();
	});
});
