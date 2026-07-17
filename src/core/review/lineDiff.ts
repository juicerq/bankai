export type LineDiffOp = {
	type: "keep" | "add" | "delete";
	text: string;
};

export type LineDiff =
	| { state: "exact"; operations: LineDiffOp[] }
	| { state: "too-large"; beforeCount: number; afterCount: number };

const MAX_DIFF_CELLS = 2_000_000;
const cache = new WeakMap<string[], WeakMap<string[], LineDiff>>();

function calculate(before: string[], after: string[]): LineDiff {
	if (before.length * after.length > MAX_DIFF_CELLS) {
		return {
			state: "too-large",
			beforeCount: before.length,
			afterCount: after.length,
		};
	}

	const width = after.length + 1;
	const lengths = new Uint32Array((before.length + 1) * width);

	for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex++) {
		for (let afterIndex = 1; afterIndex <= after.length; afterIndex++) {
			const index = beforeIndex * width + afterIndex;
			lengths[index] = before[beforeIndex - 1] === after[afterIndex - 1]
				? lengths[(beforeIndex - 1) * width + afterIndex - 1]! + 1
				: Math.max(
					lengths[(beforeIndex - 1) * width + afterIndex]!,
					lengths[beforeIndex * width + afterIndex - 1]!,
				);
		}
	}

	const operations: LineDiffOp[] = [];
	let beforeIndex = before.length;
	let afterIndex = after.length;

	while (beforeIndex > 0 && afterIndex > 0) {
		if (before[beforeIndex - 1] === after[afterIndex - 1]) {
			operations.push({ type: "keep", text: after[afterIndex - 1]! });
			beforeIndex--;
			afterIndex--;
			continue;
		}

		if (
			lengths[(beforeIndex - 1) * width + afterIndex]!
			>= lengths[beforeIndex * width + afterIndex - 1]!
		) {
			operations.push({ type: "delete", text: before[beforeIndex - 1]! });
			beforeIndex--;
			continue;
		}

		operations.push({ type: "add", text: after[afterIndex - 1]! });
		afterIndex--;
	}

	while (beforeIndex > 0) {
		operations.push({ type: "delete", text: before[beforeIndex - 1]! });
		beforeIndex--;
	}

	while (afterIndex > 0) {
		operations.push({ type: "add", text: after[afterIndex - 1]! });
		afterIndex--;
	}

	return { state: "exact", operations: operations.toReversed() };
}

export function lineDiff(before: string[], after: string[]): LineDiff {
	let byAfter = cache.get(before);
	if (!byAfter) {
		byAfter = new WeakMap();
		cache.set(before, byAfter);
	}

	let result = byAfter.get(after);
	if (!result) {
		result = calculate(before, after);
		byAfter.set(after, result);
	}

	return result;
}
