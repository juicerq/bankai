import "./register-dom";
import { afterEach, expect, mock, test } from "bun:test";
import { get, query, slot } from "./dom";
import { cleanup, render } from "./testing-library";

let replayed = "";

class MockAddon {
	fit() {}
	loadAddon() {}
	dispose() {}
}

class MockTerminal {
	loadAddon() {}
	open() {}
	write(data: string) {
		replayed += data;
	}
	dispose() {}
}

void mock.module("@xterm/xterm", () => ({ Terminal: MockTerminal }));
void mock.module("@xterm/addon-fit", () => ({ FitAddon: MockAddon }));
void mock.module("@renderer/routes/-features/terminal/terminal-style", () => ({
	registerTerminalStyle: () => () => {},
	TERMINAL_OPTIONS: {},
}));

globalThis.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

const { ServiceLogPane } = await import("@renderer/routes/-features/services/service-log-pane");

afterEach(() => {
	replayed = "";
	cleanup();
});

function renderPane(props: { output?: string; outputPending?: boolean }) {
	render(
		<ServiceLogPane
			projectId="beta"
			commandId="beta-api"
			label="beta api"
			status="failed"
			resizeDeferred={false}
			onClose={() => {}}
			{...props}
		/>,
	);
}

test("a service that has not run during this launch names the empty case", () => {
	renderPane({});

	expect(slot(get("service-log"), "service-no-output").textContent).toBe(
		"This service has no output yet. Start it to read its output.",
	);
	expect(query("service-log")?.querySelector('[data-slot="service-retained-output"]')).toBeFalsy();
});

test("a failed service with retained output reads it instead of the empty message", () => {
	renderPane({ output: "Error: port already in use\r\n" });

	expect(slot(get("service-log"), "service-retained-output")).toBeTruthy();
	expect(replayed).toBe("Error: port already in use\r\n");
	expect(get("service-log").textContent).not.toContain("no output yet");
});

test("the pane stays quiet while the retained output is still being read", () => {
	renderPane({ outputPending: true });

	expect(get("service-log").querySelector('[data-slot="service-no-output"]')).toBeNull();
	expect(replayed).toBe("");
});
