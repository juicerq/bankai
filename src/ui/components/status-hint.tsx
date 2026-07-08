import { theme } from "@ui/theme";

type HintMode = "terminal" | "idle" | "empty";

const HINTS: Record<HintMode, string> = {
	terminal: "^X → commands · ^1-9 project · ⌥1-9 tab · drag select",
	idle: "⏎ focus shell · n new · x close · ^1-9/↑↓ project · ⌥1-9 tab · ^X commands",
	empty: "n new shell · ^1-9/↑↓ project · a add",
};

const LEADER_HINT = "^X → s sidebar · r review · n new · d close · tab next · q quit";

export function StatusHint({ mode, leader }: { mode: HintMode; leader: boolean }) {
	const label = leader ? LEADER_HINT : HINTS[mode];

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
			<text style={{ fg: leader ? theme.accent : theme.textFaint }}>{label}</text>
		</box>
	);
}
