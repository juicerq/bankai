import { useEffect, useRef } from "react";
import { RGBA } from "@opentui/core";
import { extend } from "@opentui/react";
import { TerminalRenderable } from "@core/terminal/TerminalRenderable";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";
import { theme } from "@ui/theme";

extend({ terminal: TerminalRenderable });

declare module "@opentui/react" {
	interface OpenTUIComponents {
		terminal: typeof TerminalRenderable;
	}
}

export function TerminalView({
	supervisor,
	tabId,
	focused,
}: {
	supervisor: TabSupervisor;
	tabId: string;
	focused: boolean;
}) {
	const ref = useRef<TerminalRenderable>(null);

	useEffect(() => {
		const renderable = ref.current;
		if (!renderable) {
			return;
		}

		const screen = supervisor.screen(tabId);
		if (screen) {
			renderable.attach(screen);
		}

		renderable.cursorColors = { block: RGBA.fromHex(theme.accent), text: RGBA.fromHex(theme.bg) };
		renderable.onCellResize = (cols, rows) => supervisor.resize(tabId, cols, rows);
		const size = renderable.cellSize;
		if (size) {
			supervisor.resize(tabId, size.cols, size.rows);
		}

		return () => {
			renderable.onCellResize = null;
			renderable.detach();
		};
	}, [supervisor, tabId]);

	useEffect(() => {
		ref.current?.setFocused(focused);
	}, [focused]);

	return <terminal ref={ref} style={{ flexGrow: 1 }} />;
}
