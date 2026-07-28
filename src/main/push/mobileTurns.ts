const claimed = new Set<string>();

export const MobileTurns = {
	claim(shellId: string): void {
		claimed.add(shellId);
	},

	release(shellId: string): boolean {
		return claimed.delete(shellId);
	},

	owns(shellId: string): boolean {
		return claimed.has(shellId);
	},
};
