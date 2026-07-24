import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import type { BankaiUpdateApi, UpdateDownloadedEvent } from "@shared/update";
import { UpdateNotification } from "@renderer/routes/-components/update-notification";
import { get, query, slot } from "./dom";
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

describe("Update notification", () => {
	test("stays hidden until an update is downloaded", () => {
		render(<UpdateNotification />);

		expect(query("update-notification")).toBeNull();
	});

	test("appears with the downloaded version", () => {
		render(<UpdateNotification />);

		emit("0.3.0");

		expect(get("update-notification").dataset.version).toBe("0.3.0");
	});

	test("shows an already-downloaded update on mount", async () => {
		pending = { version: "0.3.1" };
		render(<UpdateNotification />);
		await act(async () => {});

		expect(get("update-notification").dataset.version).toBe("0.3.1");
	});

	test("restart triggers the install bridge", () => {
		render(<UpdateNotification />);
		emit("0.3.0");

		fireEvent.click(slot(get("update-notification"), "restart"));

		expect(install).toHaveBeenCalledTimes(1);
	});

	test("dismiss hides the notification for the session", () => {
		render(<UpdateNotification />);
		emit("0.3.0");

		fireEvent.click(slot(get("update-notification"), "dismiss"));

		expect(query("update-notification")).toBeNull();
	});
});
