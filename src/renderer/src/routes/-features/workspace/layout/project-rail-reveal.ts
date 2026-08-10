let revealed = false;
const listeners = new Set<() => void>();

export const ProjectRailReveal = {
	subscribe: (listener: () => void) => {
		listeners.add(listener);

		return () => listeners.delete(listener);
	},
	get: () => revealed,
	set(value: boolean) {
		if (value === revealed) {
			return;
		}

		revealed = value;
		for (const listener of listeners) {
			listener();
		}
	},
};
