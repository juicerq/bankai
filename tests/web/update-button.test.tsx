import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { BankaiUpdateApi, UpdateDownloadedEvent, UpdateWorkload } from "@shared/update";
import { UpdateButton } from "@renderer/routes/-features/app/update/update-button";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

let pending: UpdateDownloadedEvent | null;
let workload: UpdateWorkload;
let listener: ((event: UpdateDownloadedEvent) => void) | undefined;
const install = jest.fn();

function emit(version: string) {
	act(() => listener?.({ version }));
}

async function click(element: HTMLElement) {
	await act(async () => {
		fireEvent.click(element);
	});
}

beforeEach(() => {
	pending = null;
	workload = { kind: "agents", count: 0 };
	listener = undefined;
	install.mockClear();
	const api: BankaiUpdateApi = {
		getPending: async () => pending,
		countActiveWork: async () => workload,
		install,
		onDownloaded: (next) => {
			listener = next;
			return () => {
				listener = undefined;
			};
		},
	};
	window.bankaiUpdate = api;
});

afterEach(() => {
	cleanup();
});

describe("Update button", () => {
	test("stays hidden until an update is downloaded", () => {
		render(<UpdateButton />);

		expect(query("update-button")).toBeNull();
	});

	test("appears with the downloaded version", () => {
		render(<UpdateButton />);

		emit("0.3.0");

		expect(get("update-button").dataset.version).toBe("0.3.0");
	});

	test("names the version it will install", () => {
		render(<UpdateButton />);

		emit("0.3.0");

		expect(get("update-button").getAttribute("aria-label")).toBe("Update to v0.3.0");
	});

	test("carries the version on its face, not only in the tooltip", () => {
		render(<UpdateButton />);

		emit("0.3.0");

		expect(slot(get("update-button"), "update-version").textContent).toBe("v0.3.0");
	});

	test("shows an already-downloaded update on mount", async () => {
		pending = { version: "0.3.1" };
		render(<UpdateButton />);
		await act(async () => {});

		expect(get("update-button").dataset.version).toBe("0.3.1");
	});

	test("an open terminal with no agent installs without asking", async () => {
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(query("update-confirm")).toBeNull();
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("a click waits for confirmation while agents are mid-turn", async () => {
		workload = { kind: "agents", count: 3 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(install).not.toHaveBeenCalled();
		expect(slot(get("update-confirm"), "confirm-message").textContent).toContain("stops 3 agents mid-turn");
	});

	test("the confirmation counts a lone agent in the singular", async () => {
		workload = { kind: "agents", count: 1 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(slot(get("update-confirm"), "confirm-message").textContent).toContain("stops 1 agent mid-turn");
	});

	test("counts shells instead where agent activity is unavailable", async () => {
		workload = { kind: "shells", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(slot(get("update-confirm"), "confirm-message").textContent).toContain("closes 2 open shells");
	});

	test("confirming installs and closes the dialog", async () => {
		workload = { kind: "agents", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");
		await click(get("update-button"));

		await click(slot(get("update-confirm"), "confirm-accept"));

		expect(query("update-confirm")).toBeNull();
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("cancelling keeps the agents running and installs nothing", async () => {
		workload = { kind: "agents", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");
		await click(get("update-button"));

		await click(slot(get("update-confirm"), "confirm-cancel"));

		expect(query("update-confirm")).toBeNull();
		expect(install).not.toHaveBeenCalled();
	});
});
