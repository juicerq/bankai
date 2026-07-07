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
				<text style={{ fg: theme.accent, attributes: TextAttributes.BOLD }}>FEEDBACK</text>
			</box>

			<box style={{ flexGrow: 1, padding: 1 }}>
				<box
					style={{
						flexGrow: 1,
						padding: 1,
						border: true,
						borderColor: theme.border,
					}}
				>
					<text style={{ fg: theme.textFaint }}>Composer disabled in this build.</text>
				</box>
			</box>

			<box style={{ paddingLeft: 1, paddingRight: 1, paddingBottom: 1 }}>
				<text style={{ fg: theme.textFaint }}>Cascade lands in a later slice.</text>
			</box>
		</box>
	);
}
