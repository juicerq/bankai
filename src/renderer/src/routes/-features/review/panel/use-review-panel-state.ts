import { useCallback, useRef, useState } from "react";
import type { LayoutSettings } from "@shared/settings";

export type WorkspaceBayMode = "closed" | "review" | "page";

export function useReviewPanelState({
	initialOpen,
	initialExpanded,
	persist,
	onClose,
}: {
	initialOpen: boolean;
	initialExpanded: boolean;
	persist: (patch: LayoutSettings) => void;
	onClose: () => void;
}) {
	const [mode, setMode] = useState<WorkspaceBayMode>(initialOpen ? "review" : "closed");
	const [expanded, setExpanded] = useState(initialExpanded);
	const restoreMode = useRef<WorkspaceBayMode | null>(null);
	const changeMode = useCallback((nextMode: WorkspaceBayMode) => {
		restoreMode.current = null;
		setMode(nextMode);
		persist({ reviewOpen: nextMode === "review" });

		if (nextMode === "closed") {
			onClose();
		}
	}, [onClose, persist]);
	const changeExpanded = useCallback((nextExpanded: boolean) => {
		restoreMode.current = null;
		setExpanded(nextExpanded);
		persist({ reviewExpanded: nextExpanded });
	}, [persist]);
	const toggleFocus = useCallback(() => {
		if (expanded) {
			const nextMode = restoreMode.current ?? mode;
			restoreMode.current = null;
			setMode(nextMode);
			setExpanded(false);
			persist({ reviewOpen: nextMode === "review", reviewExpanded: false });

			if (nextMode === "closed") {
				onClose();
			}

			return;
		}

		restoreMode.current = mode;
		if (mode === "closed") {
			setMode("review");
		}
		setExpanded(true);
		persist({ reviewOpen: mode !== "page", reviewExpanded: true });
	}, [expanded, mode, onClose, persist]);

	return {
		mode,
		expanded,
		changeMode,
		changeExpanded,
		toggleFocus,
	};
}
