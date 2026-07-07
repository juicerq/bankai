import { useEffect, useRef } from "react";
import { extend } from "@opentui/react";
import { TerminalRenderable } from "@core/terminal/TerminalRenderable";
import type { TabSupervisor } from "@core/terminal/TabSupervisor";

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

		renderable.onCellResize = (cols, rows) => supervisor.resize(tabId, cols, rows);
		const off = supervisor.onRender(tabId, () => renderable.requestRender());

		return () => {
			off();
			renderable.onCellResize = null;
			renderable.detach();
		};
	}, [supervisor, tabId]);

	useEffect(() => {
		ref.current?.setFocused(focused);
	}, [focused]);

	return <terminal ref={ref} style={{ flexGrow: 1 }} />;
}
