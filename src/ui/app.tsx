import { useState } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { TabSupervisor } from "@core/terminal/TabSupervisor";
import { Terminal } from "@ui/terminal/terminal";

// Spike (task 01): one full-screen shell, to prove the xterm/headless → openTUI
// blit end-to-end. The sidebar/tabs chrome lands in later slices.
export function App() {
	const { width, height } = useTerminalDimensions();
	const [supervisor] = useState(() => new TabSupervisor());
	const [tabId] = useState(() =>
		supervisor.open({ cwd: process.cwd(), cols: width, rows: height }),
	);

	return (
		<box style={{ width, height }}>
			<Terminal supervisor={supervisor} tabId={tabId} focused />
		</box>
	);
}
