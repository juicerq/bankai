import "./register-dom";
import "./stream-transport";
import { get, query, slot } from "./dom";
import { act, cleanup, render } from "./testing-library";
import { afterEach, expect, test } from "bun:test";
import { streamStatus } from "@renderer/lib/stream/status";
import { StreamOverlay } from "@renderer/routes/-features/app/status/stream-overlay";

afterEach(() => {
	cleanup();
	streamStatus.set("open");
});

test("a healthy stream leaves the window untouched", () => {
	streamStatus.set("open");
	render(<StreamOverlay />);

	expect(query("stream-overlay")).toBeNull();
});

test("a dropped stream blocks the window and offers a retry", () => {
	streamStatus.set("open");
	render(<StreamOverlay />);

	act(() => streamStatus.set("reconnecting"));

	const overlay = get("stream-overlay", { status: "reconnecting" });

	expect(slot(overlay, "retry")).toBeDefined();
});

test("a newer server blocks the window and offers only a restart", () => {
	streamStatus.set("open");
	render(<StreamOverlay />);

	act(() => streamStatus.set("outdated"));

	const overlay = get("stream-overlay", { status: "outdated" });

	expect(slot(overlay, "restart")).toBeDefined();
	expect(() => slot(overlay, "retry")).toThrow();
});
