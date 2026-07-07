import { TextAttributes } from "@opentui/core";
import { theme } from "@ui/theme";

const WIDTH = 32;

export function ReviewFeedback() {
	return (
		<box
			style={{
				width: WIDTH,
				flexDirection: "column",
				backgroundColor: theme.panel,
				border: ["left"],
				borderColor: theme.border,
			}}
		>
			<box style={{ paddingLeft: 1, paddingRight: 1, paddingTop: 1 }}>
				<text>
					<span style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>FEEDBACK</span>
					<span style={{ fg: theme.textFaint }}> · soon</span>
				</text>
			</box>

			<box style={{ flexGrow: 1, padding: 1, justifyContent: "center", alignItems: "center" }}>
				<text style={{ fg: theme.textFaint }}>reply to a turn</text>
				<text style={{ fg: theme.textFaint }}>lands in a later slice</text>
			</box>

			<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1, flexDirection: "column" }}>
				<box style={{ padding: 1, border: true, borderColor: theme.border }}>
					<text style={{ fg: theme.textFaint }}>▍ reply to this turn…</text>
				</box>
				<text style={{ fg: theme.textFaint }}>composer reserved</text>
			</box>
		</box>
	);
}
