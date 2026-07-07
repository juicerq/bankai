import { theme } from "@ui/theme";

type HintMode = "terminal" | "idle" | "empty";

const HINTS: Record<HintMode, string> = {
	terminal: "⌥s sidebar · ⌥1-9 tab · ⌥←→ cycle · ⌥v review · x close",
	idle: "⏎ focus shell · n new · x close · ↑↓ project",
	empty: "n new shell · ↑↓ project · a add",
};

export function StatusHint({ mode }: { mode: HintMode }) {
	return (
		<box
			style={{
				paddingLeft: 1,
				paddingRight: 1,
				backgroundColor: theme.panel,
				border: ["top"],
				borderColor: theme.border,
			}}
		>
			<text style={{ fg: theme.textFaint }}>{HINTS[mode]}</text>
		</box>
	);
}
