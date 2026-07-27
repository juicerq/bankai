import { useSyncExternalStore } from "react";

const SECOND = 1000;

function subscribe(notify: () => void) {
	const ticking = setInterval(notify, SECOND);

	return () => clearInterval(ticking);
}

function currentSecond() {
	return Math.floor(Date.now() / SECOND) * SECOND;
}

export function useSecondsClock(): number {
	return useSyncExternalStore(subscribe, currentSecond);
}
