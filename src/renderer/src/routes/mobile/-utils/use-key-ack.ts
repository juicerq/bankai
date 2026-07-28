import { useRef, useState } from "react";
import type { TerminalKey } from "@main/terminal/input";

export const KEY_ACK_MS = 2000;

export function useKeyAck(signature: string, send: (key: TerminalKey) => Promise<void>) {
	const observed = useRef(signature);
	const [problem, setProblem] = useState<string>();
	const [deaf, setDeaf] = useState(false);

	observed.current = signature;

	const press = async (key: TerminalKey) => {
		const before = signature;
		setProblem(undefined);
		setDeaf(false);

		try {
			await send(key);
		} catch (err) {
			setProblem(err instanceof Error ? err.message : String(err));

			return;
		}

		setTimeout(() => {
			if (observed.current === before) {
				setDeaf(true);
			}
		}, KEY_ACK_MS);
	};

	return { problem, deaf, press };
}
