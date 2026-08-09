import "./register-dom";
import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ReviewQuickOpen } from "@renderer/routes/-features/review/header/review-quick-open/review-quick-open";
import { VISIBLE_MATCHES } from "@renderer/routes/-features/review/header/review-quick-open/model";
import { get, query, slot } from "./dom";
import { cleanup, fireEvent, render } from "./testing-library";

afterEach(cleanup);

const PATHS = [
	"src/main/agents/harness/claude/claude-harness.ts",
	"src/renderer/src/routes/-features/review/panel/review-panel.tsx",
	"README.md",
];

function renderQuickOpen(
	options: { paths?: string[]; onOpenFile?: (path: string) => void; onClose?: () => void } = {},
) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

	return render(
		<ReviewQuickOpen
			projectId="p1"
			worktree="/p1"
			paths={options.paths ?? PATHS}
			onOpenFile={options.onOpenFile ?? (() => {})}
			onClose={options.onClose ?? (() => {})}
		/>,
		{
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
			),
		},
	);
}

function type(value: string) {
	fireEvent.input(slot(get("review-quick-open"), "filter-input"), { target: { value } });
}

function press(key: string) {
	fireEvent.keyDown(slot(get("review-quick-open"), "filter-input"), { key });
}

function item(path: string) {
	return get("review-quick-open-item", { path });
}

test("a folder the tree would have merged away is still offered on its own", () => {
	renderQuickOpen({ paths: ["src/main/agents/harness/claude/claude-harness.ts"] });

	type("agents");

	expect(item("src/main/agents").dataset.kind).toBe("directory");
});

test("the filter matches against the whole path, not the file name", () => {
	renderQuickOpen();

	type("routes/-features");

	expect(item("src/renderer/src/routes/-features/review/panel/review-panel.tsx").dataset.kind).toBe("file");
	expect(query("review-quick-open-item", { path: "README.md" })).toBeNull();
});

test("a match on the file name outranks a match on the directory", () => {
	renderQuickOpen({ paths: ["docs/harness/guide.md", "src/harness.ts"] });

	type("harness");

	expect(item("src/harness.ts").dataset.index).toBe("0");
	expect(item("docs/harness").dataset.index).toBe("1");
	expect(item("docs/harness/guide.md").dataset.index).toBe("2");
});

test("the typed letters are matched in order, not as one block", () => {
	renderQuickOpen();

	type("clhar");

	expect(item("src/main/agents/harness/claude/claude-harness.ts")).not.toBeNull();
});

test("the arrows walk the list and enter opens the highlighted file in the reader", () => {
	const opened: string[] = [];
	let closed = 0;
	renderQuickOpen({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	type("harness");

	expect(get("review-quick-open").dataset.highlighted).toBe(
		"path:src/main/agents/harness/claude/claude-harness.ts",
	);

	press("ArrowDown");

	expect(get("review-quick-open").dataset.highlighted).toBe("path:src/main/agents/harness");

	press("ArrowUp");
	press("Enter");

	expect(opened).toEqual(["src/main/agents/harness/claude/claude-harness.ts"]);
	expect(closed).toBe(1);
});

test("arrow up reaches content search without replacing the default file choice", () => {
	renderQuickOpen();

	type("README");

	expect(get("review-quick-open").dataset.highlighted).toBe("path:README.md");

	press("ArrowUp");

	expect(get("review-quick-open").dataset.highlighted).toBe("content:README");
});

test("escape closes without opening anything", () => {
	const opened: string[] = [];
	let closed = 0;
	renderQuickOpen({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	press("Escape");

	expect(opened).toEqual([]);
	expect(closed).toBe(1);
});

test("choosing a folder narrows the filter into it and leaves the picker open", () => {
	const opened: string[] = [];
	let closed = 0;
	renderQuickOpen({ onOpenFile: (path) => opened.push(path), onClose: () => (closed += 1) });

	type("renderer");
	fireEvent.click(item("src/renderer"));

	expect(opened).toEqual([]);
	expect(closed).toBe(0);
	expect(item("src/renderer/src/routes/-features/review/panel/review-panel.tsx").dataset.index).toBe("0");
	expect(query("review-quick-open-item", { path: "README.md" })).toBeNull();
});

test("a filter that matches more paths than the list shows says how many it found", () => {
	const paths = Array.from({ length: VISIBLE_MATCHES + 3 }, (_, index) => `src/file-${index}.ts`);
	renderQuickOpen({ paths });

	type("file");

	expect(slot(get("review-quick-open"), "match-count").textContent).toBe(`${VISIBLE_MATCHES} OF ${paths.length}`);
});
