export function assertDefined<T>(
	value: T | null | undefined,
	message?: string,
): asserts value is T {
	if (value === undefined || value === null) {
		throw new Error(message ?? "Expected value to be defined");
	}
}
