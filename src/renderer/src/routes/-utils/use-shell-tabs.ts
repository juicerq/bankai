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
	onShellMove,
	onShellSelect,
}: {
	projectId: string;
	restoredShells: RestoredShell[] | undefined;
	restoredActiveShellId: string | undefined;
	onShellOpen: (projectId: string, shell: ShellTab) => void;
	onShellClose: (projectId: string, shellId: string) => void;
	onShellMove: (projectId: string, shellId: string, toIndex: number) => void;
	onShellSelect: (projectId: string, shellId: string) => void;
}) {
	const [topology] = useState(() => initialShellTopology(restoredShells, restoredActiveShellId));
	const [tabs, setTabs] = useState<ShellTab[]>(topology.tabs);
	const [activeTabId, setActiveTabId] = useState<string | undefined>(topology.activeTabId);
	const [sessionIds, setSessionIds] = useState<Record<string, string>>({});
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
			const tabIndex = tabs.findIndex((tab) => tab.id === tabId);
			const remaining = tabs.filter((tab) => tab.id !== tabId);
			setTabs(remaining);
			setSessionIds((current) => {
				const { [tabId]: _removed, ...rest } = current;
				return rest;
			});
			if (activeTabId === tabId) {
				setActiveTabId(remaining[Math.max(0, tabIndex - 1)]?.id);
			}
			onShellClose(projectId, tabId);
		},
		[tabs, activeTabId, onShellClose, projectId],
	);

	const moveTab = useCallback(
		(data: { tabId: string; toIndex: number }) => {
			setTabs((current) => {
				const others = current.filter((tab) => tab.id !== data.tabId);
				const moved = current.filter((tab) => tab.id === data.tabId);

				return [...others.slice(0, data.toIndex), ...moved, ...others.slice(data.toIndex)];
			});
			onShellMove(projectId, data.tabId, data.toIndex);
		},
		[onShellMove, projectId],
	);

	const bindSession = useCallback((tabId: string, sessionId: string) => {
		setSessionIds((current) => ({ ...current, [tabId]: sessionId }));
	}, []);

	return {
		tabs,
		activeTabId,
		sessionIds,
		resumableShellIds: topology.resumableShellIds,
		registerDefaultShell,
		selectTab,
		openTab,
		closeTab,
		moveTab,
		bindSession,
	};
}
