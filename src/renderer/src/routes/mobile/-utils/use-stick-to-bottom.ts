import { useCallback, useRef } from "react";

const STICK_THRESHOLD_PX = 48;

export function useStickToBottom() {
	const ref = useRef<HTMLDivElement>(null);
	const stuck = useRef(true);

	const contentRef = useCallback((content: HTMLElement | null) => {
		if (!content) {
			return;
		}

		const observer = new ResizeObserver(() => {
			const element = ref.current;
			if (!element || !stuck.current) {
				return;
			}

			element.scrollTop = element.scrollHeight - element.clientHeight;
		});

		observer.observe(content);

		return () => observer.disconnect();
	}, []);

	const handleScroll = useCallback(() => {
		const element = ref.current;
		if (!element) {
			return;
		}

		stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_THRESHOLD_PX;
	}, []);

	return { ref, contentRef, handleScroll };
}
