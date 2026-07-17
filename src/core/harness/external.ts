export function accepted<T>(contract: { assert(value: unknown): T }, value: unknown): T | null {
	try {
		return contract.assert(value);
	} catch {
		return null;
	}
}

export function parsedJson(raw: string): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(raw) as unknown };
	} catch {
		return { ok: false };
	}
}
