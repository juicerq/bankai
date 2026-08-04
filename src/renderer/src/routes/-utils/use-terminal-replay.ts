import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useCallback } from "react";
import { registerTerminalStyle, TERMINAL_OPTIONS } from "@renderer/routes/-utils/terminal-style";

export function useTerminalReplay(output: string) {
	return useCallback((container: HTMLDivElement | null) => {
		if (!container) {
			return;
		}

		const terminal = new Terminal({
			...TERMINAL_OPTIONS,
			cursorBlink: false,
			disableStdin: true,
		});
		const stopStyle = registerTerminalStyle(terminal);

		const fit = new FitAddon();
		terminal.loadAddon(fit);
		terminal.open(container);
		terminal.write(output);

		const resize = new ResizeObserver(() => {
			if (container.clientWidth > 0 && container.clientHeight > 0) {
				fit.fit();
			}
		});
		resize.observe(container);

		return () => {
			resize.disconnect();
			stopStyle();
			terminal.dispose();
		};
	}, [output]);
}
