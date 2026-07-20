import { useState } from "react";
import { type DiffScope, nextScope } from "@core/review/diffScope";

export function usePanelView(tabKey: string | undefined) {
	const [scope, setScope] = useState<DiffScope>("turn");
	const [unified, setUnified] = useState(false);
	const [folded, setFolded] = useState(true);
	const [boundKey, setBoundKey] = useState(tabKey);

	if (tabKey !== boundKey) {
		setBoundKey(tabKey);
		setScope("turn");
	}

	return {
		scope,
		unified,
		folded,
		cycleScope(): DiffScope {
			const next = nextScope(scope);
			setScope(next);
			return next;
		},
		toggleUnified() {
			setUnified((value) => !value);
		},
		toggleFolded() {
			setFolded((value) => !value);
		},
	};
}
