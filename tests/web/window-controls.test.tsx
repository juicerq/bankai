import { afterEach, expect, test } from "bun:test";
import { WindowControls } from "@renderer/routes/-features/app/chrome/window-controls";
import { useFocusTopBand } from "@renderer/routes/-features/workspace/layout/use-focus-top-band";
import type { BankaiWindowApi } from "@shared/window";
import { slot } from "./dom";
import { act, cleanup, fireEvent, render } from "./testing-library";

const listeners = new Set<() => void>();
let maximized = false;
let toggles = 0;

function stubWindowApi() {
	maximized = false;
	toggles = 0;
	listeners.clear();

	const api: BankaiWindowApi = {
		minimize: () => {},
		toggleMaximize: () => {
			toggles += 1;
		},
		close: () => {},
		isMaximized: () => maximized,
		onMaximizedChange: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};

	Object.assign(window, { bankaiWindow: api });
}

function publishMaximized(value: boolean) {
	act(() => {
		maximized = value;
		for (const listener of listeners) {
			listener();
		}
	});
}

function Harness() {
	return <WindowControls fullscreen={false} topBand={useFocusTopBand()} />;
}

afterEach(() => {
	cleanup();
	Reflect.deleteProperty(window, "bankaiWindow");
});

test("the maximize control turns into a restore control while the window is maximized", () => {
	stubWindowApi();
	render(<Harness />);

	expect(slot(document.body, "toggle-maximize").getAttribute("aria-label")).toBe("Maximize window");

	publishMaximized(true);
	expect(slot(document.body, "toggle-maximize").getAttribute("aria-label")).toBe("Restore window");

	publishMaximized(false);
	expect(slot(document.body, "toggle-maximize").getAttribute("aria-label")).toBe("Maximize window");
});

test("clicking the control asks the window to toggle", () => {
	stubWindowApi();
	render(<Harness />);

	fireEvent.click(slot(document.body, "toggle-maximize"));
	expect(toggles).toBe(1);
});
