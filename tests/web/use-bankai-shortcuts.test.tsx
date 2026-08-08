import { afterEach, expect, test } from "bun:test";
import { useState } from "react";
import { useBankaiShortcuts } from "@renderer/routes/-features/app/use-bankai-shortcuts";
import { get } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

function ShortcutHarness() {
	const [fullscreenToggles, setFullscreenToggles] = useState(0);
	const [shells, setShells] = useState<string[]>([]);
	const [archivedShells, setArchivedShells] = useState<string[]>([]);
	const [modifierHeld, setModifierHeld] = useState(false);
	const [jumped, setJumped] = useState("");
	const [settingsOpens, setSettingsOpens] = useState(0);
	const registerShortcuts = useBankaiShortcuts({
		onToggleFullscreen: () => setFullscreenToggles((current) => current + 1),
		onNewShell: () => setShells((current) => [...current, `shell-${current.length + 1}`]),
		onArchiveShell: () => {
			setShells((current) => current.slice(0, -1));
			setArchivedShells((current) => [...current, "shell-1"]);
		},
		onOpenSettings: () => setSettingsOpens((current) => current + 1),
		onModifierHold: setModifierHeld,
		onJumpToRow: (index) => setJumped(`row-${index}`),
		onJumpToWaiting: () => setJumped("waiting"),
	});

	return (
		<main
			ref={registerShortcuts}
			data-component="shortcut-state"
			data-fullscreen-toggles={fullscreenToggles}
			data-shells={shells.join(",")}
			data-archived-shells={archivedShells.join(",")}
			data-modifier-held={modifierHeld}
			data-jumped={jumped}
			data-settings-opens={settingsOpens}
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
});

test("window blur disarms a pending fullscreen leader", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.blur(window);
	const fullscreenPassedThrough = fireEvent.keyDown(window, { key: "f", code: "KeyF" });

	expect(fullscreenPassedThrough).toBe(true);
	expect(get("shortcut-state").dataset.fullscreenToggles).toBe("0");
});

test("the leader followed by t opens a shell against the selected session", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const newPassedThrough = fireEvent.keyDown(window, { key: "t", code: "KeyT" });

	expect(newPassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.shells).toBe("shell-1");
});

test("the leader followed by x archives the selected session", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	fireEvent.keyDown(window, { key: "t", code: "KeyT" });
	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const archivePassedThrough = fireEvent.keyDown(window, { key: "x", code: "KeyX" });

	expect(archivePassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.shells).toBe("");
	expect(get("shortcut-state").dataset.archivedShells).toBe("shell-1");
});

test("the leader followed by a comma opens settings", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "x", code: "KeyX", ctrlKey: true });
	const settingsPassedThrough = fireEvent.keyDown(window, { key: ",", code: "Comma" });

	expect(settingsPassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.settingsOpens).toBe("1");
});

test("a comma on its own is typed into the Shell", () => {
	render(<ShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: ",", code: "Comma" });

	expect(typedPassedThrough).toBe(true);
	expect(get("shortcut-state").dataset.settingsOpens).toBe("0");
});

test("t on its own reaches the Shell instead of opening one", () => {
	render(<ShortcutHarness />);

	const typedPassedThrough = fireEvent.keyDown(window, { key: "t", code: "KeyT" });

	expect(typedPassedThrough).toBe(true);
	expect(get("shortcut-state").dataset.shells).toBe("");
});

test("holding and releasing the modifier is reported both ways", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true });
	expect(get("shortcut-state").dataset.modifierHeld).toBe("true");

	fireEvent.keyUp(window, { key: "Alt", code: "AltLeft" });
	expect(get("shortcut-state").dataset.modifierHeld).toBe("false");
});

test("window blur releases a held modifier", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true });
	fireEvent.blur(window);

	expect(get("shortcut-state").dataset.modifierHeld).toBe("false");
});

test("a modifier tapped with a digit jumps and leaves nothing held", () => {
	render(<ShortcutHarness />);

	fireEvent.keyDown(window, { key: "Alt", code: "AltLeft", altKey: true });
	const jumpPassedThrough = fireEvent.keyDown(window, { key: "3", code: "Digit3", altKey: true });
	fireEvent.keyUp(window, { key: "Alt", code: "AltLeft" });

	expect(jumpPassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.jumped).toBe("row-2");
	expect(get("shortcut-state").dataset.modifierHeld).toBe("false");
});

test("the waiting jump draws nothing and needs no modifier held", () => {
	render(<ShortcutHarness />);

	const jumpPassedThrough = fireEvent.keyDown(window, { key: "Tab", code: "Tab", ctrlKey: true });

	expect(jumpPassedThrough).toBe(false);
	expect(get("shortcut-state").dataset.jumped).toBe("waiting");
	expect(get("shortcut-state").dataset.modifierHeld).toBe("false");
});

test("the project digit shortcut is gone", () => {
	render(<ShortcutHarness />);

	const digitPassedThrough = fireEvent.keyDown(window, { key: "2", code: "Digit2", ctrlKey: true });

	expect(digitPassedThrough).toBe(true);
	expect(get("shortcut-state").dataset.jumped).toBe("");
});
