let probedAt = 0;

export const DaemonProbes = {
	note: () => {
		probedAt = Date.now();
	},
	lastAt: () => probedAt,
};
