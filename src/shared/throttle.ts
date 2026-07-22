export function throttle<Args extends unknown[]>(callback: (...args: Args) => void, interval: number) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingArgs: Args | undefined;

	const flush = () => {
		if (!pendingArgs) {
			timer = undefined;
			return;
		}

		const args = pendingArgs;
		pendingArgs = undefined;
		callback(...args);
		timer = setTimeout(flush, interval);
	};

	const throttled = (...args: Args) => {
		if (timer === undefined) {
			callback(...args);
			timer = setTimeout(flush, interval);
			return;
		}

		pendingArgs = args;
	};

	throttled.cancel = () => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
		pendingArgs = undefined;
	};

	return throttled;
}
