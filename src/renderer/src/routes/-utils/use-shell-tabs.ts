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
	restoredActiveShellId,
	onShellOpen,
	onShellClose,
	onShellSelect,
}: {
	projectId: string;
	restoredShells: RestoredShell[] | undefined;
	restoredActiveShellId: string | undefined;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
}) {
	const [topology] = useState(() => initialShellTopology(restoredShells, restoredActiveShellId));
	const [tabs, setTabs] = useState<ShellTab[]>(topology.tabs);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(topology.activeTabId);
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
			setActiveTabId(tabId);
			onShellSelect(projectId, tabId);
		},
		[onShellSelect, projectId],
	);

	const openTab = useCallback(() => {
		const tab = newShellTab(nextShellNumber.current);
		nextShellNumber.current += 1;
		setTabs((current) => [...current, tab]);
		setActiveTabId(tab.id);
		onShellOpen(projectId, tab);
	}, [onShellOpen, projectId]);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((current) => current.filter((tab) => tab.id !== tabId));
			setActiveTabId((current) => (current === tabId ? undefined : current));
			onShellClose(projectId, tabId);
		},
		[onShellClose, projectId],
	);

	return {
		tabs,
		activeTabId,
		resumableShellIds: topology.resumableShellIds,
		registerDefaultShell,
		selectTab,
		openTab,
		closeTab,
	};
}
