import "./register-dom";
import { get, query, slot } from "./dom";
import { act, cleanup, fireEvent, render, waitFor } from "./testing-library";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { streamStatus } from "@renderer/lib/stream/status";
import { PairingScreen } from "@renderer/routes/-components/pairing-screen";
import { pairingUrl, SERVER_TOKEN_STORAGE_KEY } from "@shared/server";

const TOKEN = "a".repeat(64);
const PHONE_HOST = "cachyos.tail74b3f3.ts.net";

const stopped: string[] = [];
let reads: string[] = [];

function camera({ opens = true }: { opens?: boolean } = {}) {
	const track = { kind: "video", stop: () => stopped.push("video") };

	Object.defineProperty(navigator, "mediaDevices", {
		configurable: true,
		value: {
			getUserMedia: async () => {
				if (!opens) {
					throw new Error("Permission denied");
				}

				const stream = new MediaStream();
				Object.defineProperty(stream, "getTracks", { value: () => [track] });

				return stream;
			},
		},
	});

	window.BarcodeDetector = class {
		async detect() {
			const next = reads.shift();

			if (!next) {
				return [];
			}

			return [{ rawValue: next }];
		}
	};
}

beforeEach(() => {
	window.happyDOM.setURL(`https://${PHONE_HOST}/`);
});

afterEach(() => {
	cleanup();
	streamStatus.set("open");
	reads = [];
	stopped.length = 0;
	localStorage.clear();
	Reflect.deleteProperty(navigator, "mediaDevices");
	delete window.BarcodeDetector;
});

test("a paired device never sees the pairing screen", () => {
	streamStatus.set("reconnecting");
	render(<PairingScreen />);

	expect(query("pairing-screen")).toBeNull();
});

test("a device whose browser cannot read a QR is sent to the desktop with nothing to type", () => {
	streamStatus.set("open");
	render(<PairingScreen />);

	act(() => {
		streamStatus.set("unpaired");
	});

	expect(slot(get("pairing-screen"), "message").textContent).toBe("Scan the QR in the desktop settings.");
	expect(document.querySelector("input")).toBeNull();
	expect(document.querySelector("button")).toBeNull();
});

test("a phone that can read a QR scans it without leaving the app", async () => {
	camera();
	streamStatus.set("unpaired");
	reads = [pairingUrl({ host: PHONE_HOST, token: TOKEN })];
	render(<PairingScreen />);

	fireEvent.click(slot(get("pairing-screen"), "scan"));

	expect(slot(get("pairing-screen"), "viewfinder")).toBeDefined();
	await waitFor(() => expect(localStorage.getItem(SERVER_TOKEN_STORAGE_KEY)).toBe(TOKEN));
});

test("a code that carries no key keeps the camera reading and says so", async () => {
	camera();
	streamStatus.set("unpaired");
	reads = ["https://example.com/not-a-key", pairingUrl({ host: PHONE_HOST, token: TOKEN })];
	render(<PairingScreen />);

	fireEvent.click(slot(get("pairing-screen"), "scan"));

	await waitFor(() => expect(slot(get("pairing-screen"), "refused").textContent).toContain("not a Bankai key"));
	await waitFor(() => expect(localStorage.getItem(SERVER_TOKEN_STORAGE_KEY)).toBe(TOKEN));
});

test("a refused camera says so instead of leaving a dead viewfinder", async () => {
	camera({ opens: false });
	streamStatus.set("unpaired");
	render(<PairingScreen />);

	fireEvent.click(slot(get("pairing-screen"), "scan"));

	await waitFor(() => expect(slot(get("pairing-screen"), "problem").textContent).toContain("could not open the camera"));
});

test("leaving the scanner releases the camera", async () => {
	camera();
	streamStatus.set("unpaired");
	render(<PairingScreen />);

	fireEvent.click(slot(get("pairing-screen"), "scan"));
	await waitFor(() => expect(slot(get("pairing-screen"), "viewfinder")).toBeDefined());

	fireEvent.click(slot(get("pairing-screen"), "cancel"));

	await waitFor(() => expect(stopped).toEqual(["video"]));
});
