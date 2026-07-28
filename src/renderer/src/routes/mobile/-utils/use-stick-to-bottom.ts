import { useCallback, useRef } from "react";

const STICK_THRESHOLD_PX = 48;

export function useStickToBottom() {
	const ref = useRef<HTMLDivElement>(null);
	const stuck = useRef(true);
	const anchored = useRef<number | null>(null);

	const contentRef = useCallback((content: HTMLElement | null) => {
		if (!content) {
			return;
		}

		const observer = new ResizeObserver(() => {
			const element = ref.current;
			if (!element) {
				return;
			}

			const previousHeight = anchored.current;
			if (previousHeight !== null) {
				anchored.current = null;
				element.scrollTop += element.scrollHeight - previousHeight;

				return;
			}

			if (!stuck.current) {
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

	const keepPosition = useCallback(() => {
		anchored.current = ref.current?.scrollHeight ?? null;
	}, []);

	return { ref, contentRef, handleScroll, keepPosition };
}
