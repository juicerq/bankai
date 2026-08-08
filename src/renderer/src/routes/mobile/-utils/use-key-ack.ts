import { useRef, useState } from "react";
import type { TerminalKey } from "@shared/terminal";
import { problemText } from "@renderer/routes/-features/app/status/problem-text";

export const KEY_ACK_MS = 2000;

export function useKeyAck(
	signature: string,
	send: (key: TerminalKey) => Promise<void>,
	ackMs = KEY_ACK_MS,
) {
	const observed = useRef(signature);
	const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [problem, setProblem] = useState<string>();
	const [deafFor, setDeafFor] = useState<string>();

	observed.current = signature;

	const press = async (key: TerminalKey) => {
		const before = signature;
		setProblem(undefined);
		setDeafFor(undefined);

		try {
			await send(key);
		} catch (err) {
			setProblem(problemText(err));

			return;
		}

		if (pending.current) {
			clearTimeout(pending.current);
		}

		pending.current = setTimeout(() => {
			if (observed.current === before) {
				setDeafFor(before);
			}
		}, ackMs);
	};

	return { problem, deaf: deafFor !== undefined && deafFor === signature, press };
}
