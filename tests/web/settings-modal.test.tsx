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
			{ id: "claude", label: "Claude Code", available: true },
			{ id: "codex", label: "Codex", available: true },
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

test("marks a harness the shell cannot find and never calls it current", async () => {
	transport.harnesses = [{ id: "claude", label: "Claude Code", available: false }];
	await loadedModal();

	const row = get("settings-harness", { id: "claude" });
	expect(slot(row, "missing").textContent).toBe("NOT ON PATH");
	expect(row.textContent).not.toContain("CURRENT");
});

test("persists extra arguments on blur and drops them when emptied", async () => {
	const modal = await loadedModal();
	const field = slot(modal, "harness-args");

	fireEvent.focus(field);
	fireEvent.input(field, { target: { value: "  --model opus  " } });
	fireEvent.focusOut(field);

	await waitFor(() => {
		expect(transport.updates).toEqual([{ autostart: true, id: "claude", args: "--model opus" }]);
	});

	fireEvent.input(field, { target: { value: "" } });
	fireEvent.focusOut(field);

	await waitFor(() => {
		expect(transport.updates.at(-1)).toEqual({ autostart: true, id: "claude" });
	});
});

test("leaves the arguments alone when the field is blurred untouched", async () => {
	const modal = await loadedModal();

	const field = slot(modal, "harness-args");
	fireEvent.focus(field);
	fireEvent.focusOut(field);

	expect(transport.updates).toEqual([]);
});

test("says so when a save fails instead of quietly reverting", async () => {
	transport.saveFailure = "disk is read-only";
	const modal = await loadedModal();

	fireEvent.click(slot(modal, "autostart"));

	await waitFor(() => {
		expect(slot(get("settings-modal"), "save-error").textContent).toContain("Could not save");
	});
	expect(slot(get("settings-modal"), "autostart").getAttribute("aria-checked")).toBe("true");
});

test("keeps typed arguments when the blur that saves them races the next change", async () => {
	const modal = await loadedModal();
	const field = slot(modal, "harness-args");

	fireEvent.focus(field);
	fireEvent.input(field, { target: { value: "--model opus" } });
	fireEvent.focusOut(field);
	fireEvent.click(slot(modal, "autostart"));

	await waitFor(() => {
		expect(transport.updates).toHaveLength(2);
	});
	expect(transport.updates.at(-1)).toEqual({ autostart: false, id: "claude", args: "--model opus" });
});
