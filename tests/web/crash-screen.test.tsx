import { afterEach, expect, test } from "bun:test";
import { CrashScreen } from "@renderer/routes/-features/app/status/crash-screen";
import { get, slot } from "./dom";
import { cleanup, render } from "./testing-library";

afterEach(cleanup);

test("a crash names its reason and offers the only way back a phone has", () => {
	render(<CrashScreen error={new Error("Cannot read properties of undefined")} reset={() => {}} info={undefined} />);

	const screen = get("crash-screen");

	expect(slot(screen, "reason").textContent).toBe("Cannot read properties of undefined");
	expect(document.activeElement).toBe(slot(screen, "reload"));
});
