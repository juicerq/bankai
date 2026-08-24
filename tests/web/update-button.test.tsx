import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { BankaiUpdateApi, UpdateDownloadedEvent, UpdateWorkload } from "@shared/update";
import { UpdateButton } from "@renderer/routes/-features/app/update/update-button";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

let pending: UpdateDownloadedEvent | null;
let cost: UpdateWorkload | null;
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
	cost = null;
	listener = undefined;
	install.mockClear();
	const api: BankaiUpdateApi = {
		getPending: async () => pending,
		installCost: async () => cost,
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

	test("installs without asking where the core outlives the update", async () => {
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(query("update-confirm")).toBeNull();
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("an install that would close nothing asks nothing", async () => {
		cost = { kind: "shells", count: 0 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(query("update-confirm")).toBeNull();
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("a click waits for confirmation while the install would close shells", async () => {
		cost = { kind: "shells", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(install).not.toHaveBeenCalled();
		expect(slot(get("update-confirm"), "confirm-message").textContent).toContain("closes 2 open shells");
	});

	test("the confirmation counts a lone shell in the singular", async () => {
		cost = { kind: "shells", count: 1 };
		render(<UpdateButton />);
		emit("0.3.0");

		await click(get("update-button"));

		expect(slot(get("update-confirm"), "confirm-message").textContent).toContain("closes 1 open shell");
	});

	test("confirming installs and closes the dialog", async () => {
		cost = { kind: "shells", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");
		await click(get("update-button"));

		await click(slot(get("update-confirm"), "confirm-accept"));

		expect(query("update-confirm")).toBeNull();
		expect(install).toHaveBeenCalledTimes(1);
	});

	test("cancelling keeps the shells open and installs nothing", async () => {
		cost = { kind: "shells", count: 2 };
		render(<UpdateButton />);
		emit("0.3.0");
		await click(get("update-button"));

		await click(slot(get("update-confirm"), "confirm-cancel"));

		expect(query("update-confirm")).toBeNull();
		expect(install).not.toHaveBeenCalled();
	});
});
