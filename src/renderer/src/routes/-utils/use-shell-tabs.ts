import { useCallback, useRef, useState } from "react";
import {
	initialShellTopology,
	newShellTab,
	type RestoredShell,
	type ShellTab,
} from "@renderer/routes/-utils/shell-topology";

export function useShellTabs({
	projectId,
	restoredShells,
	selectedShellId,
	onShellOpen,
	onShellClose,
	onShellSelect,
}: {
	projectId: string;
	restoredShells: RestoredShell[] | undefined;
	selectedShellId: string | undefined;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
}) {
	const [topology] = useState(() => initialShellTopology(restoredShells));
	const [tabs, setTabs] = useState<ShellTab[]>(topology.tabs);
	const nextShellNumber = useRef(topology.nextShellNumber);
	const pendingDefaultShell = useRef<ShellTab | undefined>(topology.defaultShell);

	const registerDefaultShell = useCallback(
		(node: HTMLSpanElement | null) => {
			if (!node) {
				return;
			}

			const shell = pendingDefaultShell.current;
			if (!shell) {
				return;
			}

			pendingDefaultShell.current = undefined;
			onShellOpen(projectId, shell);
		},
		[onShellOpen, projectId],
	);

	const selectTab = useCallback(
		(tabId: string) => {
			onShellSelect(projectId, tabId);
		},
		[onShellSelect, projectId],
	);

	const openTab = useCallback((plain: boolean) => {
		const tab = newShellTab(nextShellNumber.current, plain);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		onShellOpen(projectId, tab);
	}, [onShellOpen, projectId]);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((current) => current.filter((tab) => tab.id !== tabId));
			onShellClose(projectId, tabId);
		},
		[onShellClose, projectId],
	);

	const ownsSelection = tabs.some((tab) => tab.id === selectedShellId);

	return {
		tabs,
		activeTabId: ownsSelection ? selectedShellId : tabs[0]?.id,
		registerDefaultShell,
		selectTab,
		openTab,
		closeTab,
	};
}
