import { afterEach, expect, test } from "bun:test";
import { newId } from "@renderer/lib/id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const native = crypto.randomUUID.bind(crypto);

afterEach(() => {
	Object.defineProperty(crypto, "randomUUID", { configurable: true, value: native });
});

test("hands out a uuid when the browser offers one", () => {
	expect(newId()).toMatch(UUID);
});

test("still hands out a uuid where the origin has no certificate and randomUUID is gone", () => {
	Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });

	const ids = [newId(), newId()];

	expect(ids[0]).toMatch(UUID);
	expect(ids[1]).not.toBe(ids[0]);
});
