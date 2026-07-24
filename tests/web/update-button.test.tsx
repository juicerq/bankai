import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { BankaiUpdateApi, UpdateDownloadedEvent } from "@shared/update";
import { UpdateButton } from "@renderer/routes/-components/update-button";
import { get, query } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

let pending: UpdateDownloadedEvent | null;
let listener: ((event: UpdateDownloadedEvent) => void) | undefined;
const install = jest.fn();

function emit(version: string) {
	act(() => listener?.({ version }));
}

beforeEach(() => {
	pending = null;
	listener = undefined;
	install.mockClear();
	const api: BankaiUpdateApi = {
		getPending: async () => pending,
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

	test("shows an already-downloaded update on mount", async () => {
		pending = { version: "0.3.1" };
		render(<UpdateButton />);
		await act(async () => {});

		expect(get("update-button").dataset.version).toBe("0.3.1");
	});

	test("a click triggers the install bridge", () => {
		render(<UpdateButton />);
		emit("0.3.0");

		fireEvent.click(get("update-button"));

		expect(install).toHaveBeenCalledTimes(1);
	});
});
