import { useSyncExternalStore } from "react";
import type { ShellPortsDetected } from "@shared/shell-ports";

const NO_PORTS: number[] = [];

const listeners = new Set<() => void>();
let detected: ShellPortsDetected = {};
let bridged = false;

function subscribe(listener: () => void) {
	listeners.add(listener);

	if (!bridged) {
		bridged = !!window.bankaiShellPorts?.onDetected((next) => {
			detected = next;

			for (const notify of listeners) {
				notify();
			}
		});
	}

	return () => {
		listeners.delete(listener);
	};
}

export function useShellPorts(shellId: string | undefined) {
	return useSyncExternalStore(subscribe, () => (shellId ? detected[shellId] ?? NO_PORTS : NO_PORTS));
}
