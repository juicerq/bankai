import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import type { ShellPortsDetected } from "@shared/shell-ports";
import { ProjectWorkspaceHeader } from "@renderer/routes/-features/workspace/surface/project-workspace-header";
import { WorkspaceProvider } from "@renderer/routes/-features/workspace/layout/workspace-context";
import { act, cleanup, fireEvent, render } from "./testing-library";

const project = { id: "p1", name: "p1", path: "/p1", createdAt: 0 };
const detectors = new Set<(detected: ShellPortsDetected) => void>();

window.bankaiShellPorts = {
	onDetected: (listener) => {
		detectors.add(listener);

		return () => detectors.delete(listener);
	},
};

function push(detected: ShellPortsDetected) {
	act(() => {
		for (const detector of detectors) {
			detector(detected);
		}
	});
}

function renderHeader(opened: { shellId: string; url: string }[]) {
	return render(
		<WorkspaceProvider
			control={{
				initialDiffWidth: 648,
				initialTreeWidth: 200,
				onToggleFullscreen: () => {},
				onOpenSettings: () => {},
				onOpenCommands: () => {},
				onPersistLayout: () => {},
				onBayModeChange: () => {},
				onReviewExpandedChange: () => {},
				onToggleReviewFocus: () => {},
				onTreeOpenChange: () => {},
				onRequestShell: () => {},
				onRequestShellFocus: () => {},
			}}
			agents={{
				shells: new Map(),
				worktrees: new Map(),
				statusSince: new Map(),
				harnesses: new Map(),
			}}
			residency={{ asleep: new Set(), resumable: new Set(), wake: () => {}, sleep: () => {} }}
			topBand={{ revealed: false, onFocus: () => {}, onBlur: () => {} }}
		>
			<ProjectWorkspaceHeader
				project={project}
				active={false}
				fullscreen={false}
				animating={false}
				reviewOpen={false}
				pageAvailable={false}
				pageOpen={false}
				shellId="s1"
				onToggleReview={() => {}}
				onTogglePage={() => {}}
				onOpenUrl={(shellId, url) => opened.push({ shellId, url })}
			/>
		</WorkspaceProvider>,
	);
}

function portButtons() {
	return [...document.querySelectorAll<HTMLButtonElement>('[data-component="workspace-header-port"]')];
}

afterEach(() => {
	push({});
	cleanup();
	document.body.replaceChildren();
});

test("the header offers the three lowest ports the selected shell listens on", () => {
	renderHeader([]);

	expect(portButtons()).toHaveLength(0);

	push({ s1: [3000, 5173, 8080, 9229], s2: [4000] });

	expect(portButtons().map((button) => button.textContent)).toEqual(["3000", "5173", "8080"]);
});

test("a port button opens that port on the session page of its shell", () => {
	const opened: { shellId: string; url: string }[] = [];
	renderHeader(opened);
	push({ s1: [3000] });

	const [button] = portButtons();
	if (!button) {
		throw new Error("port button unavailable");
	}

	fireEvent.click(button);

	expect(opened).toEqual([{ shellId: "s1", url: "http://localhost:3000/" }]);
});

test("the header shows nothing once the shell stops listening", () => {
	renderHeader([]);
	push({ s1: [3000] });

	expect(portButtons()).toHaveLength(1);

	push({});

	expect(portButtons()).toHaveLength(0);
});
