import { type HarnessTransport, setHarnessTransport } from "./orpc-transport";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsModal } from "@renderer/routes/-components/settings-modal";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const onClose = jest.fn();
let transport: HarnessTransport;

function renderModal() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	return render(
		<QueryClientProvider client={queryClient}>
			<SettingsModal onClose={onClose} />
		</QueryClientProvider>,
	);
}

async function loadedModal() {
	renderModal();
	await waitFor(() => {
		expect(slot(get("settings-modal"), "autostart")).not.toBeNull();
	});

	return get("settings-modal");
}

beforeEach(() => {
	onClose.mockClear();
	transport = {
		harnesses: [
			{ id: "claude", label: "Claude Code" },
			{ id: "codex", label: "Codex" },
		],
		harness: { autostart: true, id: "claude" },
		updates: [],
	};
	setHarnessTransport(transport);
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

test("shows the stored autostart switch and the selected harness", async () => {
	const modal = await loadedModal();

	expect(slot(modal, "autostart").getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "codex" }).getAttribute("aria-checked")).toBe("false");
});

test("choosing another harness persists the id and keeps autostart on", async () => {
	await loadedModal();

	fireEvent.click(get("settings-harness", { id: "codex" }));

	await waitFor(() => {
		expect(get("settings-harness", { id: "codex" }).getAttribute("aria-checked")).toBe("true");
	});
	expect(transport.updates).toEqual([{ autostart: true, id: "codex" }]);
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("false");
});

test("turning autostart off persists the switch and keeps the chosen harness", async () => {
	const modal = await loadedModal();

	fireEvent.click(slot(modal, "autostart"));

	await waitFor(() => {
		expect(slot(get("settings-modal"), "autostart").getAttribute("aria-checked")).toBe("false");
	});
	expect(transport.updates).toEqual([{ autostart: false, id: "claude" }]);
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "claude" }).hasAttribute("disabled")).toBe(true);
});

test("closes on Escape and on a click outside the panel", async () => {
	const modal = await loadedModal();

	fireEvent.keyDown(modal, { key: "Escape" });
	expect(onClose).toHaveBeenCalledTimes(1);

	fireEvent.pointerDown(modal);
	expect(onClose).toHaveBeenCalledTimes(1);
});
