import { theme } from "@ui/theme";
import { APP_KEY_HINTS } from "@ui/-utils/app-keymap";

type HintMode = "terminal" | "idle" | "empty";

export function StatusHint({ mode, leader, resize }: { mode: HintMode; leader: boolean; resize: boolean }) {
	const active = resize || leader;
	const label = resize ? APP_KEY_HINTS.resize : leader ? APP_KEY_HINTS.leader : APP_KEY_HINTS[mode];

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
			<text style={{ fg: active ? theme.accent : theme.textFaint }}>{label}</text>
		</box>
	);
}
