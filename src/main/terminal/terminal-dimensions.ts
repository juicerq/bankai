import { type } from "arktype";

export const TERMINAL_MAX_COLUMNS = 2_000;
export const TERMINAL_MAX_ROWS = 1_000;

export const terminalColumnsSchema = type("number").narrow((value) =>
	Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= TERMINAL_MAX_COLUMNS,
);

export const terminalRowsSchema = type("number").narrow((value) =>
	Number.isFinite(value) && Number.isInteger(value) && value > 0 && value <= TERMINAL_MAX_ROWS,
);
