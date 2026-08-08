export function toggledSet(values: ReadonlySet<string>, value: string): ReadonlySet<string> {
	const next = new Set(values);
	if (!next.delete(value)) {
		next.add(value);
	}
	return next;
}
