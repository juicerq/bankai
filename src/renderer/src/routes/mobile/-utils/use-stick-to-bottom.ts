import { useRef } from "react";

const STICK_THRESHOLD_PX = 48;

export function useStickToBottom() {
	const ref = useRef<HTMLDivElement>(null);
	const stuck = useRef(true);

	const anchorRef = (anchor: HTMLElement | null) => {
		const element = ref.current;
		if (!anchor || !element || !stuck.current) {
			return;
		}

		element.scrollTop = element.scrollHeight;
	};

	const handleScroll = () => {
		const element = ref.current;
		if (!element) {
			return;
		}

		stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX;
	};

	return { ref, anchorRef, handleScroll };
}
