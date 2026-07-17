import { theme } from "@ui/theme";
import { APP_KEY_HINTS } from "@ui/-utils/app-keymap";

type HintMode = "terminal" | "idle" | "empty";

export function StatusHint({ mode, leader }: { mode: HintMode; leader: boolean }) {
	const label = leader ? APP_KEY_HINTS.leader : APP_KEY_HINTS[mode];

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
