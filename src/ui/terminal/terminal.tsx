import { useEffect, useRef } from "react";
import { extend, useKeyboard } from "@opentui/react";
import { TerminalRenderable } from "@core/terminal/TerminalRenderable";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";

extend({ terminal: TerminalRenderable });

declare module "@opentui/react" {
	interface OpenTUIComponents {
		terminal: typeof TerminalRenderable;
	}
}

type TerminalProps = {
	supervisor: TabSupervisor;
	tabId: string;
	focused: boolean;
};

export function Terminal({ supervisor, tabId, focused }: TerminalProps) {
	const ref = useRef<TerminalRenderable>(null);

	// Imperative bridge: the tab's screen is an external mutable emitter owned by
	// the supervisor, not derivable state. Bind the renderable to it, keep the
	// PTY sized to the layout, and repaint whenever the shell emits.
	useEffect(() => {
		const renderable = ref.current;
		if (!renderable) {
			return;
		}

		const screen = supervisor.screen(tabId);
		if (screen) {
			renderable.attach(screen);
		}

		renderable.onCellResize = (cols, rows) => supervisor.resize(tabId, cols, rows);
		const off = supervisor.onRender(tabId, () => renderable.requestRender());

		return () => {
			off();
			renderable.onCellResize = null;
			renderable.detach();
		};
	}, [supervisor, tabId]);

	// Imperative: reflect focus into the renderable so it draws the cursor.
	useEffect(() => {
		ref.current?.setFocused(focused);
	}, [focused]);

	// Imperative: forward raw key bytes to the shell. Keyboard is an external
	// event stream, not state — only the focused tab consumes it.
	useKeyboard((key) => {
		if (!focused) {
			return;
		}

		supervisor.input(tabId, key.raw);
	});

	return <terminal ref={ref} style={{ flexGrow: 1 }} />;
}
