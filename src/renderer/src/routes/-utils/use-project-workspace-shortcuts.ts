import { useCallback } from "react";

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

export function useProjectWorkspaceShortcuts({
	active,
	tabs,
	activeTabId,
	onActivateTab,
	onCloseTab,
	onNewTab,
	onToggleReview,
}: {
	active: boolean;
	tabs: { id: string }[];
	activeTabId?: string;
	onActivateTab: (tabId: string) => void;
	onCloseTab: (tabId: string) => void;
	onNewTab: () => void;
	onToggleReview: () => void;
}) {
	return useCallback(() => {
		let leaderArmed = false;

		const shortcutAction = (event: KeyboardEvent) => {
			if (!active) {
				return;
			}

			if (leaderArmed) {
				leaderArmed = false;
				if (event.code === "KeyR") {
					return onToggleReview;
				}
				if (event.code === "KeyT") {
					return onNewTab;
				}
				if (event.code === "KeyX" && activeTabId) {
					return () => onCloseTab(activeTabId);
				}

				return;
			}

			if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === "KeyX") {
				return () => {
					leaderArmed = true;
				};
			}

			if (!event.altKey || event.ctrlKey || event.metaKey || !event.code.startsWith("Digit")) {
				return;
			}

			const tab = tabs[Number(event.code.slice(5)) - 1];
			return () => {
				if (tab) {
					onActivateTab(tab.id);
				}
			};
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (MODIFIER_KEYS.has(event.key)) {
				return;
			}

			const action = shortcutAction(event);
			if (!action) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			action();
		};
		const handleWindowBlur = () => {
			leaderArmed = false;
		};

		window.addEventListener("keydown", handleKeyDown, true);
		window.addEventListener("blur", handleWindowBlur);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, true);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [active, tabs, activeTabId, onActivateTab, onCloseTab, onNewTab, onToggleReview]);
}
