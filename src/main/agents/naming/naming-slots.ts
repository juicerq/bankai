export const NAMING_SLOTS = 5;

const waiting: (() => void)[] = [];
let taken = 0;

async function acquire(): Promise<void> {
	if (taken < NAMING_SLOTS) {
		taken += 1;

		return;
	}

	await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
	const next = waiting.shift();

	if (next) {
		next();

		return;
	}

	taken -= 1;
}

export async function withNamingSlot<T>(run: () => Promise<T>): Promise<T> {
	await acquire();

	try {
		return await run();
	} finally {
		release();
	}
}
