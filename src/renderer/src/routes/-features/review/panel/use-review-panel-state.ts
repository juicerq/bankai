import { useCallback, useRef, useState } from "react";
import type { LayoutSettings } from "@shared/settings";

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
	const [open, setOpen] = useState(initialOpen);
	const [expanded, setExpanded] = useState(initialExpanded);
	const restoreOpen = useRef<boolean | null>(null);
	const changeOpen = useCallback((nextOpen: boolean) => {
		restoreOpen.current = null;
		setOpen(nextOpen);
		persist({ reviewOpen: nextOpen });

		if (!nextOpen) {
			onClose();
		}
	}, [onClose, persist]);
	const changeExpanded = useCallback((nextExpanded: boolean) => {
		restoreOpen.current = null;
		setExpanded(nextExpanded);
		persist({ reviewExpanded: nextExpanded });
	}, [persist]);
	const toggleFocus = useCallback(() => {
		if (expanded) {
			const nextOpen = restoreOpen.current ?? open;
			restoreOpen.current = null;
			setOpen(nextOpen);
			setExpanded(false);
			persist({ reviewOpen: nextOpen, reviewExpanded: false });

			if (!nextOpen) {
				onClose();
			}

			return;
		}

		restoreOpen.current = open;
		setOpen(true);
		setExpanded(true);
		persist({ reviewOpen: true, reviewExpanded: true });
	}, [expanded, onClose, open, persist]);

	return {
		open,
		expanded,
		changeOpen,
		changeExpanded,
		toggleFocus,
	};
}
