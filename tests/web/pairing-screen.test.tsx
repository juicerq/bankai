import "./register-dom";
import { get, query, slot } from "./dom";
import { act, cleanup, render } from "./testing-library";
import { afterEach, expect, test } from "bun:test";
import { streamStatus } from "@renderer/lib/stream/status";
import { PairingScreen } from "@renderer/routes/-components/pairing-screen";

afterEach(() => {
	cleanup();
	streamStatus.set("open");
});

test("a paired device never sees the pairing screen", () => {
	streamStatus.set("reconnecting");
	render(<PairingScreen />);

	expect(query("pairing-screen")).toBeNull();
});

test("an unpaired device is sent to the desktop QR with nothing to type", () => {
	streamStatus.set("open");
	render(<PairingScreen />);

	act(() => {
		streamStatus.set("unpaired");
	});

	expect(slot(get("pairing-screen"), "message").textContent).toBe("Scan the QR in the desktop settings.");
	expect(document.querySelector("input")).toBeNull();
	expect(document.querySelector("button")).toBeNull();
});
