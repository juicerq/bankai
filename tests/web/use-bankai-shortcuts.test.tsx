import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useBankaiShortcuts } from "@renderer/routes/-utils/use-bankai-shortcuts";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ShortcutHarness() {
	const [fullscreenToggles, setFullscreenToggles] = useState(0);
	const [activeProjectId, setActiveProjectId] = useState("");
	const registerShortcuts = useBankaiShortcuts({
		projects: [{ id: "bankai" }, { id: "dogama" }],
		onActivateProject: setActiveProjectId,
		onToggleFullscreen: () => setFullscreenToggles((current) => current + 1),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="shortcut-state"
			data-fullscreen-toggles={fullscreenToggles}
			data-active-project-id={activeProjectId}
		/>
	);
}

test("recognized shortcuts stay out of the Shell", () => {
	render(<ShortcutHarness />);

	const leaderPassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const fullscreenPassedThrough = fireEvent.keyDown(window, { key: "f", code: "KeyF" });

	expect(leaderPassedThrough).toBe(false);
	expect(fullscreenPassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.fullscreenToggles).toBe("1");

	fireEvent.keyDown(window, { key: "2", code: "Digit2", ctrlKey: true });
	expect(get("shortcut-state").dataset.activeProjectId).toBe("dogama");
});

test("window blur disarms a pending fullscreen leader", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.blur(window);
	const fullscreenPassedThrough = fireEvent.keyDown(window, { key: "f", code: "KeyF" });

	expect(fullscreenPassedThrough).toBe(true);
	expect(get("shortcut-state").dataset.fullscreenToggles).toBe("0");
});
