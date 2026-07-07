import { type } from "arktype";
import { Store } from "@core/store/Store";

const flag = type({
	turnId: "string > 0",
	"path?": "string",
	"line?": "number",
});

const flagsContract = type({ "[string]": flag.array() });

export type Flag = typeof flag.infer;
type FlagsValue = typeof flagsContract.infer;

const store = new Store({
	name: "flags",
	version: 1,
	contract: flagsContract,
	migrators: {},
	seed: (): FlagsValue => ({}),
});

interface SetFlagInput {
	sessionId: string;
	turnId: string;
	path?: string;
	line?: number;
	flagged: boolean;
}

function flagFrom(input: SetFlagInput): Flag {
	if (input.path !== undefined && input.line !== undefined) {
		return { turnId: input.turnId, path: input.path, line: input.line };
	}

	return { turnId: input.turnId };
}

export const Flags = {
	get: async (sessionId: string) => (await store.read())[sessionId] ?? [],
	setFlag: async (input: SetFlagInput) => {
		const next = await store.mutate((current) => {
			const without = (current[input.sessionId] ?? []).filter(
				(f) =>
					f.turnId !== input.turnId ||
					f.path !== input.path ||
					f.line !== input.line,
			);

			return {
				...current,
				[input.sessionId]: input.flagged
					? [...without, flagFrom(input)]
					: without,
			};
		});

		return next[input.sessionId] ?? [];
	},
};
