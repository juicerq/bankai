import {
	type HarnessTransport,
	type MobileTransport,
	setHarnessTransport,
	setMobileTransport,
	setThemeTransport,
	type ThemeTransport,
} from "./orpc-transport";
import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Project } from "@shared/projects";
import type { BankaiSessionPageApi } from "@shared/session-page";
import { SettingsScreen } from "@renderer/routes/-features/settings/settings-screen";
import { WINDOW_NO_DRAG_CLASS } from "@renderer/routes/-features/app/chrome/window-drag";
import { TailscaleAccess } from "@main/infra/tailscale/tailscale-access";
import { pairingUrl } from "@shared/server";
import { DEFAULT_THEME, THEME_LIGHT_CLASS } from "@shared/theme";
import { get, slot } from "./dom";
import { cleanup, fireEvent, render, waitFor } from "./testing-library";

const MOBILE_HOST = "cachyos.tail74b3f3.ts.net";
const PAIRING_URL = pairingUrl({ origin: `https://${MOBILE_HOST}`, token: "a".repeat(64) });
const TAILNET_URL = pairingUrl({ origin: "http://100.105.249.8:4696", token: "a".repeat(64) });

const onClose = jest.fn();
let transport: HarnessTransport;
let mobile: MobileTransport;
let theme: ThemeTransport;
let browserDataClears = 0;
const projects: Project[] = [
	{ id: "bankai", name: "bankai", path: "/projects/bankai", createdAt: 1, reviewClosedTargets: [] },
];

function renderScreen() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

	return render(
		<QueryClientProvider client={queryClient}>
			<SettingsScreen
				projects={projects}
				shellCounts={new Map()}
				onOpenDirectory={() => {}}
				onRemoveProject={() => {}}
				onClose={onClose}
			/>
		</QueryClientProvider>,
	);
}

async function loadedScreen(section: string = "harness") {
	renderScreen();
	await waitFor(() => {
		expect(slot(get("settings-screen"), "autostart")).not.toBeNull();
	});
	fireEvent.click(get("settings-nav", { id: section }));

	return get("settings-screen");
}

beforeEach(() => {
	onClose.mockClear();
	browserDataClears = 0;
	window.bankaiSessionPage = {
		present: async () => {},
		release: async () => {},
		goBack: async () => {},
		goForward: async () => {},
		reload: async () => {},
		openExternal: async () => {},
		clearData: async () => {
			browserDataClears += 1;
		},
		snapshot: async () => null,
		preview: async () => null,
		onState: () => () => {},
		onShortcut: () => () => {},
	} satisfies BankaiSessionPageApi;
	transport = {
		harnesses: [
			{ id: "claude", label: "Claude Code", conversation: true, available: true },
			{ id: "codex", label: "Codex", conversation: false, available: true },
		],
		harness: { autostart: true, id: "claude" },
		updates: [],
	};
	setHarnessTransport(transport);
	mobile = {
		access: {
			host: MOBILE_HOST,
			url: PAIRING_URL,
			exposed: false,
			tailnetUrl: TAILNET_URL,
			tailnetOpen: false,
			problem: undefined,
		},
		exposeCalls: [],
		regenerations: 0,
	};
	setMobileTransport(mobile);
	theme = { theme: DEFAULT_THEME, updates: [] };
	setThemeTransport(theme);
});

afterEach(() => {
	cleanup();
	delete window.bankaiSessionPage;
	document.body.replaceChildren();
	document.documentElement.classList.remove(THEME_LIGHT_CLASS);
});

test("clears the Bankai browser profile only after confirmation", async () => {
	const screen = await loadedScreen("data");

	fireEvent.click(slot(screen, "clear-browser-data"));

	const confirmation = get("clear-browser-data-confirm");
	expect(slot(confirmation, "confirm-message").textContent).toContain("sign out");
	expect(browserDataClears).toBe(0);

	fireEvent.click(slot(confirmation, "confirm-accept"));

	await waitFor(() => {
		expect(browserDataClears).toBe(1);
	});
});

test("shows the stored autostart switch and the selected harness", async () => {
	const screen = await loadedScreen();

	expect(slot(screen, "autostart").getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "codex" }).getAttribute("aria-checked")).toBe("false");
});

test("keeps project management in settings", async () => {
	await loadedScreen("projects");

	expect(get("settings-project", { projectId: "bankai" })).toBeDefined();
});

test("choosing another harness persists the id and keeps autostart on", async () => {
	await loadedScreen();

	fireEvent.click(get("settings-harness", { id: "codex" }));

	await waitFor(() => {
		expect(get("settings-harness", { id: "codex" }).getAttribute("aria-checked")).toBe("true");
	});
	expect(transport.updates).toEqual([{ autostart: true, id: "codex" }]);
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("false");
});

test("turning autostart off persists the switch and keeps the chosen harness", async () => {
	const screen = await loadedScreen();

	fireEvent.click(slot(screen, "autostart"));

	await waitFor(() => {
		expect(slot(get("settings-screen"), "autostart").getAttribute("aria-checked")).toBe("false");
	});
	expect(transport.updates).toEqual([{ autostart: false, id: "claude" }]);
	expect(get("settings-harness", { id: "claude" }).getAttribute("aria-checked")).toBe("true");
	expect(get("settings-harness", { id: "claude" }).hasAttribute("disabled")).toBe(true);
});

test("closes on Escape and on the back control", async () => {
	const screen = await loadedScreen();
	const backControl = slot(screen, "close-settings");

	fireEvent.keyDown(screen, { key: "Escape" });
	expect(onClose).toHaveBeenCalledTimes(1);

	expect(backControl.classList.contains(WINDOW_NO_DRAG_CLASS)).toBe(true);
	fireEvent.click(backControl);
	expect(onClose).toHaveBeenCalledTimes(2);
});

test("shows one section at a time and keeps the chosen one marked", async () => {
	const screen = await loadedScreen();

	expect(get("settings-nav", { id: "harness" }).getAttribute("aria-current")).toBe("page");
	expect(screen.querySelector('[data-component="settings-projects"]')).toBeNull();

	fireEvent.click(get("settings-nav", { id: "projects" }));

	expect(get("settings-nav", { id: "projects" }).getAttribute("aria-current")).toBe("page");
	expect(get("settings-nav", { id: "harness" }).hasAttribute("aria-current")).toBe(false);
	expect(screen.querySelector('[data-slot="autostart"]')).toBeNull();
	expect(get("settings-projects")).toBeDefined();
});

test("marks a harness the shell cannot find and never calls it current", async () => {
	transport.harnesses = [{ id: "claude", label: "Claude Code", conversation: true, available: false }];
	await loadedScreen();

	const row = get("settings-harness", { id: "claude" });
	expect(slot(row, "missing").textContent).toBe("NOT ON PATH");
	expect(row.textContent).not.toContain("CURRENT");
});

test("persists extra arguments on blur and drops them when emptied", async () => {
	const screen = await loadedScreen();
	const field = slot(screen, "harness-args");

	fireEvent.focus(field);
	fireEvent.input(field, { target: { value: "  --model opus  " } });
	fireEvent.focusOut(field);

	await waitFor(() => {
		expect(transport.updates).toEqual([
			{ autostart: true, id: "claude", profiles: { claude: { args: "--model opus" } } },
		]);
	});

	fireEvent.input(field, { target: { value: "" } });
	fireEvent.focusOut(field);

	await waitFor(() => {
		expect(transport.updates.at(-1)).toEqual({ autostart: true, id: "claude", profiles: { claude: {} } });
	});
});

test("leaves the arguments alone when the field is blurred untouched", async () => {
	const screen = await loadedScreen();

	const field = slot(screen, "harness-args");
	fireEvent.focus(field);
	fireEvent.focusOut(field);

	expect(transport.updates).toEqual([]);
});

test("says so when a save fails instead of quietly reverting", async () => {
	transport.saveFailure = "disk is read-only";
	const screen = await loadedScreen();

	fireEvent.click(slot(screen, "autostart"));

	await waitFor(() => {
		expect(slot(get("settings-screen"), "save-error").textContent).toContain("Could not save");
	});
	expect(slot(get("settings-screen"), "autostart").getAttribute("aria-checked")).toBe("true");
});

test("keeps typed arguments when the blur that saves them races the next change", async () => {
	const screen = await loadedScreen();
	const field = slot(screen, "harness-args");

	fireEvent.focus(field);
	fireEvent.input(field, { target: { value: "--model opus" } });
	fireEvent.focusOut(field);
	fireEvent.click(slot(screen, "autostart"));

	await waitFor(() => {
		expect(transport.updates).toHaveLength(2);
	});
	expect(transport.updates.at(-1)).toEqual({
		autostart: false,
		id: "claude",
		profiles: { claude: { args: "--model opus" } },
	});
});

test("shows the pairing link and its QR once Tailscale names the machine", async () => {
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "pairing-url").textContent).toBe(PAIRING_URL);
	});
	expect(slot(screen, "pairing-qr").tagName.toLowerCase()).toBe("svg");
	expect(slot(screen, "mobile-access").getAttribute("aria-checked")).toBe("false");
});

test("leaves the pairing controls dead while nothing is serving the phone", async () => {
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "pairing-url")).not.toBeNull();
	});
	expect(slot(screen, "regenerate-token").hasAttribute("disabled")).toBe(true);

	fireEvent.click(slot(screen, "enlarge-qr"));

	expect(screen.querySelector('[data-slot="enlarged-qr"]')).toBeNull();
});

test("the QR enlarges to a dialog and Escape closes only the enlargement", async () => {
	mobile.access = { ...mobile.access, exposed: true };
	const screen = await loadedScreen("mobile");
	await waitFor(() => {
		expect(slot(screen, "pairing-url")).not.toBeNull();
	});

	fireEvent.click(slot(screen, "enlarge-qr"));

	const enlarged = slot(screen, "enlarged-qr");
	expect(enlarged.getAttribute("role")).toBe("dialog");
	expect(enlarged.querySelector('[data-slot="pairing-qr"]')).not.toBeNull();

	fireEvent.keyDown(enlarged, { key: "Escape" });

	expect(screen.querySelector('[data-slot="enlarged-qr"]')).toBeNull();
	expect(onClose).not.toHaveBeenCalled();
});

test("turning mobile access on asks tailscale to serve the app", async () => {
	const screen = await loadedScreen("mobile");
	await waitFor(() => {
		expect(slot(screen, "pairing-url")).not.toBeNull();
	});

	fireEvent.click(slot(screen, "mobile-access"));

	await waitFor(() => {
		expect(slot(get("settings-screen"), "mobile-access").getAttribute("aria-checked")).toBe("true");
	});
	expect(mobile.exposeCalls).toEqual([true]);
});

test("regenerating the token replaces the pairing link", async () => {
	mobile.access = { ...mobile.access, exposed: true };
	const screen = await loadedScreen("mobile");
	await waitFor(() => {
		expect(slot(screen, "pairing-url")).not.toBeNull();
	});
	const before = slot(screen, "pairing-url").textContent;

	fireEvent.click(slot(screen, "regenerate-token"));

	await waitFor(() => {
		expect(slot(get("settings-screen"), "pairing-url").textContent).not.toBe(before);
	});
	expect(mobile.regenerations).toBe(1);
});

test("says so plainly when Tailscale names no machine instead of showing a broken QR", async () => {
	mobile.access = {
		host: undefined,
		url: undefined,
		exposed: false,
		tailnetUrl: undefined,
		tailnetOpen: false,
		problem: undefined,
	};
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "no-tailscale").textContent).toContain("MagicDNS");
	});
	expect(screen.querySelector('[data-slot="pairing-qr"]')).toBeNull();
});

test("surfaces the operator remedy when tailscale refuses the change", async () => {
	mobile.access = { ...mobile.access, problem: TailscaleAccess.TAILSCALE_OPERATOR_REMEDY };
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "mobile-access-problem").textContent).toContain("sudo tailscale set --operator=$USER");
	});
});

test("falls back to the tailnet address when the tailnet issues no certificate", async () => {
	mobile.plainOnly = true;
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "pairing-url")).not.toBeNull();
	});
	expect(screen.querySelector('[data-slot="mobile-access-problem"]')).toBeNull();

	fireEvent.click(slot(screen, "mobile-access"));

	await waitFor(() => {
		expect(slot(get("settings-screen"), "pairing-url").textContent).toBe(TAILNET_URL);
	});
	expect(slot(get("settings-screen"), "tailnet-notice").textContent).toContain("login.tailscale.com/admin/dns");
	expect(slot(get("settings-screen"), "mobile-access").getAttribute("aria-checked")).toBe("true");
});

test("says nothing about plain HTTP while HTTPS is working", async () => {
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "pairing-url").textContent).toBe(PAIRING_URL);
	});
	expect(screen.querySelector('[data-slot="tailnet-notice"]')).toBeNull();
});

test("pairs against the tailnet address while it is the only way in", async () => {
	mobile.access = { ...mobile.access, tailnetOpen: true };
	const screen = await loadedScreen("mobile");

	await waitFor(() => {
		expect(slot(screen, "pairing-url").textContent).toBe(TAILNET_URL);
	});
	expect(slot(screen, "mobile-access").getAttribute("aria-checked")).toBe("true");
});

test("marks the stored theme among the three choices", async () => {
	theme.theme = "system";
	await loadedScreen("appearance");

	await waitFor(() => {
		expect(get("settings-theme", { id: "system" }).getAttribute("aria-checked")).toBe("true");
	});
	expect(get("settings-theme", { id: "dark" }).getAttribute("aria-checked")).toBe("false");
	expect(get("settings-theme", { id: "light" }).getAttribute("aria-checked")).toBe("false");
});

test("choosing the light theme persists it and paints the document at once", async () => {
	await loadedScreen("appearance");

	fireEvent.click(get("settings-theme", { id: "light" }));

	expect(document.documentElement.classList.contains(THEME_LIGHT_CLASS)).toBe(true);
	await waitFor(() => {
		expect(theme.updates).toEqual(["light"]);
	});
	expect(get("settings-theme", { id: "light" }).getAttribute("aria-checked")).toBe("true");
});

test("hands each harness its own extra arguments field", async () => {
	transport.harness = { autostart: true, id: "claude", profiles: { claude: { args: "--model opus" } } };
	const screen = await loadedScreen();

	expect(slot<HTMLInputElement>(screen, "harness-args").value).toBe("--model opus");

	fireEvent.click(get("settings-harness", { id: "codex" }));

	await waitFor(() => {
		expect(slot<HTMLInputElement>(get("settings-screen"), "harness-args").value).toBe("");
	});
});
