import type { Terminal as Screen } from "@xterm/headless";

export type TerminalMouseEncoding = "sgr" | "x10";

export function terminalMouseEncoding(screen: Screen): TerminalMouseEncoding {
	const boundary = screen as unknown as {
		_core?: { coreMouseService?: { activeEncoding?: string } };
	};
	const encoding = boundary["_core"]?.coreMouseService?.activeEncoding;
	return encoding === "SGR" || encoding === "SGR_PIXELS" ? "sgr" : "x10";
}

export function terminalWheelSequence(
	encoding: TerminalMouseEncoding,
	button: number,
	column: number,
	row: number,
): string {
	if (encoding === "sgr") {
		return `\u001B[<${button};${column};${row}M`;
	}

	return `\u001B[M${String.fromCodePoint(button + 32, column + 32, row + 32)}`;
}
